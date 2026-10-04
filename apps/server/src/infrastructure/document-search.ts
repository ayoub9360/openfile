import type { Pool } from "pg"
import type {
  AssistantScope,
  PresentedDocument,
} from "@open-file/core/assistant"
import type {
  DocumentFilter,
  DocumentMatch,
  DocumentSearch,
} from "../application/assistant-ports"
import { AppError, type User } from "../domain/model"
// All operations share this ownership/status/scope predicate. Model inputs never
// contain a user ID or an SQL fragment.
const eligible = `SELECT d.value AS doc, md5(COALESCE(d.value->>'content','') || ':' || COALESCE(d.value->>'revision','0')) AS version
 FROM workspaces w CROSS JOIN LATERAL jsonb_array_elements(w.state->'documents') d(value)
 WHERE w.user_id=$1 AND d.value->>'status'='filed'
 AND ($2='all' OR d.value->>'storage'=$2)`
const filtered = `${eligible}
 AND ($3::jsonb->>'name' IS NULL OR strpos(lower(d.value->>'name'),lower($3::jsonb->>'name'))>0)
 AND ($3::jsonb->>'issuer' IS NULL OR strpos(lower(d.value->>'issuer'),lower($3::jsonb->>'issuer'))>0)
 AND ($3::jsonb->>'folder' IS NULL OR d.value->>'folder'=$3::jsonb->>'folder' OR (COALESCE(($3::jsonb->>'includeSubfolders')::boolean,true) AND starts_with(d.value->>'folder',($3::jsonb->>'folder')||'/')))
 AND ($3::jsonb->>'kind' IS NULL OR d.value->>'kind'=$3::jsonb->>'kind')
 AND ($3::jsonb->>'dateFrom' IS NULL OR d.value->>'date'>=$3::jsonb->>'dateFrom')
 AND ($3::jsonb->>'dateTo' IS NULL OR d.value->>'date'<=$3::jsonb->>'dateTo')
 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE($3::jsonb->'tags','[]')) t(tag)
 WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(d.value->'tags','[]')) v(tag) WHERE lower(v.tag)=lower(t.tag)))`
export class PostgresDocumentSearch implements DocumentSearch {
  constructor(private pool: Pool) {}
  async count(user: User, scope: AssistantScope, filter: DocumentFilter) {
    const { rows } = await this.pool.query(
      `WITH matches AS (${filtered}) SELECT count(*)::int AS total FROM matches`,
      [user.id, scope, JSON.stringify(filter)]
    )
    return Number(rows[0].total)
  }
  async present(
    user: User,
    scope: AssistantScope,
    ids: string[]
  ): Promise<PresentedDocument[]> {
    const { rows } = await this.pool.query(
      `WITH eligible AS (${eligible}) SELECT doc->>'id' AS id,doc->>'name' AS name,doc->>'folder' AS folder,doc->>'storage' AS storage,doc->>'size' AS size,doc->>'mimeType' AS "mimeType",doc->>'date' AS date,version FROM eligible WHERE doc->>'id'=ANY($3::text[]) ORDER BY array_position($3::text[],doc->>'id')`,
      [user.id, scope, ids]
    )
    return rows.map((r) => ({ ...r, mimeType: r.mimeType ?? undefined }))
  }
  async facets(user: User, scope: AssistantScope) {
    const { rows } = await this.pool.query(
      `WITH eligible AS (${eligible}), facets AS (
      SELECT 'tags' AS kind, jsonb_array_elements_text(doc->'tags') AS value FROM eligible
      UNION ALL SELECT 'folders',doc->>'folder' FROM eligible
      UNION ALL SELECT 'issuers',doc->>'issuer' FROM eligible
      UNION ALL SELECT 'kinds',doc->>'kind' FROM eligible
    ) SELECT kind,value,count(*)::int AS count FROM facets WHERE value<>'' GROUP BY kind,value ORDER BY count(*) DESC,value LIMIT 201`,
      [user.id, scope]
    )
    return { values: rows.slice(0, 200), truncated: rows.length > 200 }
  }
  async find(
    user: User,
    scope: AssistantScope,
    filter: DocumentFilter,
    offset: number,
    limit: number,
    sort: "newest" | "oldest" | "name"
  ) {
    const order =
      sort === "name"
        ? "doc->>'name',doc->>'id'"
        : `doc->>'date' ${sort === "newest" ? "DESC" : "ASC"},doc->>'id'`
    const { rows } = await this.pool.query(
      `WITH matches AS (${filtered}), page AS (
      SELECT jsonb_build_object('id',doc->>'id','name',doc->>'name','kind',doc->>'kind','issuer',doc->>'issuer','date',doc->>'date','folder',doc->>'folder','tags',doc->'tags','summary',left(doc->>'summary',500),'version',version) AS item
      FROM matches ORDER BY ${order} LIMIT $4 OFFSET $5)
      SELECT (SELECT count(*)::int FROM matches) AS total,COALESCE((SELECT jsonb_agg(item) FROM page),'[]') AS documents`,
      [user.id, scope, JSON.stringify(filter), limit, offset]
    )
    const row = rows[0] as { total: number; documents: DocumentMatch[] }
    return {
      ...row,
      nextOffset:
        offset + row.documents.length < row.total
          ? offset + row.documents.length
          : null,
    }
  }
  async read(
    user: User,
    scope: AssistantScope,
    id: string,
    offset: number,
    length: number
  ) {
    const { rows } = await this.pool.query(
      `WITH eligible AS (${eligible}) SELECT doc->>'id' AS id,doc->>'name' AS name,doc->>'content' AS content,version FROM eligible WHERE doc->>'id'=$3`,
      [user.id, scope, id]
    )
    const row = rows[0]
    if (!row)
      throw new AppError(404, "Document unavailable in this conversation.")
    const content = String(row.content ?? "")
    return {
      source: {
        id: String(row.id),
        name: String(row.name),
        excerpt: content.slice(offset, offset + length),
        version: String(row.version),
        start: offset,
      },
      totalCharacters: content.length,
      nextOffset: offset + length < content.length ? offset + length : null,
    }
  }
  async versions(user: User, scope: AssistantScope, ids: string[]) {
    const { rows } = await this.pool.query(
      `WITH eligible AS (${eligible}) SELECT doc->>'id' AS id,version FROM eligible WHERE doc->>'id'=ANY($3::text[])`,
      [user.id, scope, ids]
    )
    return new Map<string, string>(rows.map((r) => [r.id, r.version]))
  }
  async passages(
    user: User,
    scope: AssistantScope,
    query: string,
    filter: DocumentFilter,
    vector?: number[],
    model?: string,
    mode: "text" | "semantic" | "hybrid" = "hybrid"
  ) {
    // Reciprocal rank fusion: lexical and semantic retrieval contribute equally.
    // Keep separate candidate sets; documents without vectors remain searchable.
    const { rows } = await this.pool.query(
      `WITH eligible AS (${filtered}), candidates AS (
      SELECT c.id AS chunk_id,c.document_id AS id,e.doc->>'name' AS name,c.content AS excerpt,e.version,c.position,
      ts_rank_cd(to_tsvector('english',c.content),websearch_to_tsquery('english',$4))+
      ts_rank_cd(to_tsvector('french',c.content),websearch_to_tsquery('french',$4)) AS lexical,
      CASE WHEN c.model=$6 THEN c.embedding <=> $5::vector END AS distance
      FROM document_chunks c JOIN eligible e ON e.doc->>'id'=c.document_id WHERE c.user_id=$1
    ), lexical AS (SELECT chunk_id,row_number() OVER(ORDER BY lexical DESC,chunk_id) AS rank FROM candidates WHERE lexical>0 AND $7<>'semantic' ORDER BY lexical DESC,chunk_id LIMIT 40),
    semantic AS (SELECT chunk_id,row_number() OVER(ORDER BY distance,chunk_id) AS rank FROM candidates WHERE distance<0.8 AND $7<>'text' ORDER BY distance,chunk_id LIMIT 40)
    SELECT c.id,c.name,c.excerpt,c.version,c.position FROM candidates c LEFT JOIN lexical l USING(chunk_id) LEFT JOIN semantic s USING(chunk_id)
    WHERE l.rank IS NOT NULL OR s.rank IS NOT NULL
    ORDER BY COALESCE(1.0/(60+l.rank),0)+COALESCE(1.0/(60+s.rank),0) DESC,c.chunk_id LIMIT 8`,
      [
        user.id,
        scope,
        JSON.stringify(filter),
        query,
        vector ? JSON.stringify(vector) : null,
        model ?? null,
        mode,
      ]
    )
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      excerpt: String(r.excerpt),
      version: String(r.version),
      ...(r.position != null ? { start: Number(r.position) * 1600 } : {}),
    }))
  }
}
