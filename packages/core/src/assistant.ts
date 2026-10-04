export type AssistantScope = "all" | "Local" | "Google Drive"
export type ToolName =
  | "listFacets"
  | "findDocuments"
  | "searchPassages"
  | "readDocument"
  | "countDocuments"
  | "displayDocuments"
export interface Citation {
  reference: string
  id: string
  name: string
  excerpt: string
  version: string
  start?: number
}
export interface PresentedDocument {
  id: string
  name: string
  folder: string
  storage: "Local" | "Google Drive"
  size: string
  mimeType?: string
  date: string
  version: string
}
export interface ToolRecord {
  id: string
  name: ToolName
  input: unknown
  startedAt?: string
  finishedAt?: string
  output?: unknown
  status: "running" | "complete" | "failed"
}
export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  sources: Citation[]
  tools: ToolRecord[]
  documents?: PresentedDocument[]
  status: "running" | "complete" | "interrupted" | "failed"
  notice?: string
}
export interface ConversationSummary {
  id: string
  title: string
  scope: AssistantScope
  updatedAt: string
}
export interface Conversation extends ConversationSummary {
  messages: ChatMessage[]
}
export type AssistantEvent =
  | { type: "start"; message: ChatMessage }
  | { type: "text"; text: string }
  | { type: "tool"; tool: ToolRecord }
  | { type: "documents"; documents: PresentedDocument[] }
  | { type: "sources"; sources: Citation[] }
  | { type: "notice"; notice: string }
  | { type: "done"; message: ChatMessage }
