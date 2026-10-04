import type { ToolRecord } from "@open-file/core/assistant"
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
export const toolLabels = {
  listFacets: "Explored tags and folders",
  findDocuments: "Searched for files",
  searchPassages: "Searched document content",
  readDocument: "Read a document",
  countDocuments: "Counted files",
  displayDocuments: "Displayed files",
}
export function describeOperation(tool: ToolRecord) {
  const input = record(tool.input)
  const output = record(tool.output)
  const filter = record(input.filter)
  const source = record(output.source)
  const intent =
    typeof input.intent === "string" ? input.intent.slice(0, 180) : ""
  let detail = ""
  const documents = Array.isArray(output.documents)
    ? output.documents.map(record)
    : []
  const passages = Array.isArray(output.passages)
    ? output.passages.map(record)
    : []
  if (tool.name === "countDocuments" && typeof output.count === "number")
    detail = `${output.count} file${output.count === 1 ? "" : "s"}${typeof filter.folder === "string" ? ` in ${filter.folder}` : ""}${filter.includeSubfolders === false ? " · direct files only" : ""}`
  else if (tool.name === "findDocuments" && typeof output.total === "number")
    detail = `${documents.length} of ${output.total} matching files${output.nextOffset != null ? " · more available" : ""}`
  else if (tool.name === "searchPassages")
    detail = `${passages.length} relevant passage${passages.length === 1 ? "" : "s"}${typeof input.query === "string" ? ` · “${input.query}”` : ""}`
  else if (tool.name === "readDocument" && typeof source.name === "string")
    detail = `${source.name}${output.nextOffset != null ? " · excerpt" : ""}`
  else if (tool.name === "displayDocuments")
    detail = `${documents.length} file${documents.length === 1 ? "" : "s"} shown`
  else if (tool.name === "listFacets" && Array.isArray(output.values))
    detail = `${output.values.length} tags, folders and categories${output.truncated ? " · partial list" : ""}`
  const references =
    tool.name === "readDocument"
      ? [source]
      : tool.name === "displayDocuments"
        ? documents
        : []
  const links = references
    .filter(
      (d): d is Record<string, unknown> & { id: string; name: string } =>
        typeof d.id === "string" && typeof d.name === "string"
    )
    .slice(0, 4)
    .map((d) => ({ id: d.id, name: d.name }))
  return { title: intent || toolLabels[tool.name], detail, links }
}
