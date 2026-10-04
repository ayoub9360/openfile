import { env } from "../config"
import { AppError } from "../domain/model"
import { randomUUID } from "node:crypto"
import type { Pool, PoolClient } from "pg"
import { englishWorkspace, type Workspace } from "@open-file/core/workspace"
import {
  emptyWorkspace,
  type Chunk,
  type FileRef,
  type Source,
  type User,
} from "../domain/model"
import type { Repository, UnitOfWork } from "../application/ports"
export class PostgresRepository implements Repository {
  constructor(private pool: Pool) {}
  async ensure(user: User) {
    await this.pool.query(
      "INSERT INTO workspaces(user_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [user.id, JSON.stringify(emptyWorkspace(user))]
    )
  }
  async load(user: User): Promise<Workspace> {
    await this.ensure(user)
    const result = await this.pool.query(
      "SELECT state FROM workspaces WHERE user_id=$1",
      [user.id]
    )
    return englishWorkspace(result.rows[0].state)
  }
  async file(userId: string, id: string): Promise<FileRef | undefined> {
    const result = await this.pool.query(
      "SELECT reference FROM document_files WHERE user_id=$1 AND document_id=$2",
      [userId, id]
    )
    return result.rows[0]?.reference
  }
  async transaction<T>(
    user: User,
    action: (unit: UnitOfWork) => Promise<T>
  ): Promise<T> {
    await this.ensure(user)
    const db = await this.pool.connect()
    try {
      await db.query("BEGIN")
      const { rows } = await db.query(
        "SELECT state FROM workspaces WHERE user_id=$1 FOR UPDATE",
        [user.id]
      )
      const state = englishWorkspace(rows[0].state as Workspace)
      const unit: UnitOfWork = {
        state,
        checkCapacity: async (bytes, newDocument) => {
          // Serialize capacity checks through commit, including the storage copy.
          // Cleanup copies continue to count until the worker confirms removal.
          await db.query("SELECT pg_advisory_xact_lock(8172322)")
          const usage = await db.query(
            `WITH copies AS (
            SELECT user_id,(reference->>'bytes')::bigint AS bytes FROM document_files
            UNION ALL SELECT user_id,(payload->>'bytes')::bigint FROM jobs
              WHERE kind='cleanup' AND status<>'done'
          ) SELECT COALESCE(sum(bytes),0) AS total,
              COALESCE(sum(bytes) FILTER (WHERE user_id=$1),0) AS own FROM copies`,
            [user.id]
          )
          if (
            (newDocument && state.documents.length >= env.MAX_USER_DOCUMENTS) ||
            Number(usage.rows[0].own) + bytes > env.MAX_USER_BYTES ||
            Number(usage.rows[0].total) + bytes > env.MAX_TOTAL_BYTES
          )
            throw new AppError(
              413,
              "Storage quota reached. Delete files or ask the administrator to increase the quota."
            )
        },
        purgeConversations: async (id) => {
          await db.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,2))",
            [user.id]
          )
          // Remove the entire affected history: follow-ups can paraphrase a source
          // without carrying its ID. Cancel running histories to prevent reinsertion.
          await db.query(
            `DELETE FROM conversations c WHERE c.user_id=$1 AND EXISTS (
            SELECT 1 FROM conversation_messages m WHERE m.conversation_id=c.id AND (
              m.body->>'status'='running' OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(m.body->'sources','[]')) s
                WHERE s->>'id'=$2
              ) OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(m.body->'documents','[]')) d
                WHERE d->>'id'=$2
              )
            ))`,
            [user.id, id]
          )
        },
        file: async (id) => {
          const r = await db.query(
            "SELECT reference FROM document_files WHERE user_id=$1 AND document_id=$2",
            [user.id, id]
          )
          return r.rows[0]?.reference
        },
        setFile: async (id, file) => {
          await db.query(
            "INSERT INTO document_files(user_id,document_id,reference) VALUES($1,$2,$3) ON CONFLICT(user_id,document_id) DO UPDATE SET reference=$3",
            [user.id, id, JSON.stringify(file)]
          )
        },
        deleteFile: async (id) => {
          await db.query(
            "DELETE FROM document_files WHERE user_id=$1 AND document_id=$2",
            [user.id, id]
          )
        },
        enqueue: async (type, id, payload) => {
          if (type === "analyze") {
            const pending = await db.query(
              "SELECT count(*)::int AS count FROM jobs WHERE user_id=$1 AND status IN ('queued','running')",
              [user.id]
            )
            if (pending.rows[0].count >= env.MAX_USER_JOBS)
              throw new AppError(
                429,
                "Processing queue is full. Wait for your current imports to finish."
              )
          }
          await db.query(
            "INSERT INTO jobs(id,user_id,document_id,kind,payload) VALUES($1,$2,$3,$4,$5)",
            [randomUUID(), user.id, id, type, JSON.stringify(payload ?? {})]
          )
        },
        setChunks: (id, chunks) => this.setChunks(db, user.id, id, chunks),
      }
      const result = await action(unit)
      state.activities = state.activities.slice(0, 500)
      await db.query(
        "UPDATE workspaces SET state=$2, updated_at=now() WHERE user_id=$1",
        [user.id, JSON.stringify(state)]
      )
      await db.query("COMMIT")
      return result
    } catch (error) {
      await db.query("ROLLBACK")
      throw error
    } finally {
      db.release()
    }
  }
  private async setChunks(
    db: PoolClient,
    userId: string,
    id: string,
    chunks: Chunk[]
  ) {
    await db.query(
      "DELETE FROM document_chunks WHERE user_id=$1 AND document_id=$2",
      [userId, id]
    )
    for (const [position, chunk] of chunks.entries())
      await db.query(
        "INSERT INTO document_chunks(id,user_id,document_id,content,embedding,model,position) VALUES($1,$2,$3,$4,$5::vector,$6,$7)",
        [
          chunk.id,
          userId,
          id,
          chunk.text,
          chunk.embedding ? JSON.stringify(chunk.embedding) : null,
          chunk.model ?? null,
          position,
        ]
      )
  }
  async search(
    userId: string,
    question: string,
    ids?: string[],
    embedding?: number[],
    model?: string
  ): Promise<Source[]> {
    const { rows } = await this.pool.query(
      `SELECT c.document_id AS id, d.value->>'name' AS name, c.content AS excerpt,
      (ts_rank_cd(to_tsvector('english', c.content), replace(plainto_tsquery('english',$2)::text,' & ',' | ')::tsquery) +
      ts_rank_cd(to_tsvector('french', c.content), replace(plainto_tsquery('french',$2)::text,' & ',' | ')::tsquery)) AS rank
      FROM document_chunks c JOIN workspaces w ON w.user_id=c.user_id
      CROSS JOIN LATERAL jsonb_array_elements(w.state->'documents') d(value)
      WHERE c.user_id=$1 AND d.value->>'id'=c.document_id AND d.value->>'status'='filed'
      AND ($3::text[] IS NULL OR c.document_id=ANY($3))
      AND (to_tsvector('english',c.content) @@ replace(plainto_tsquery('english',$2)::text,' & ',' | ')::tsquery
      OR to_tsvector('french',c.content) @@ replace(plainto_tsquery('french',$2)::text,' & ',' | ')::tsquery OR ($4::vector IS NOT NULL AND c.model=$5))
      ORDER BY CASE WHEN $4::vector IS NOT NULL AND c.model=$5 THEN c.embedding <=> $4::vector ELSE 2 END, rank DESC LIMIT 6`,
      [
        userId,
        question,
        ids ?? null,
        embedding ? JSON.stringify(embedding) : null,
        model ?? null,
      ]
    )
    const sources = new Map<string, Source>()
    for (const { id, name, excerpt } of rows) {
      const existing = sources.get(id)
      if (existing) existing.excerpt += "\n\n" + excerpt
      else sources.set(id, { id, name, excerpt })
    }
    return [...sources.values()]
  }
}
