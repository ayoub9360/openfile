import type {
  AssistantEvent,
  AssistantScope,
  ChatMessage,
  Citation,
  Conversation,
  ConversationSummary,
  ToolName,
  PresentedDocument,
} from "@open-file/core/assistant"
import type { DocumentKind } from "@open-file/core/workspace"
import type { User } from "../domain/model"
export interface DocumentFilter {
  name?: string
  tags?: string[]
  kind?: DocumentKind
  issuer?: string
  folder?: string
  includeSubfolders?: boolean
  dateFrom?: string
  dateTo?: string
}
export interface DocumentMatch {
  id: string
  name: string
  kind: DocumentKind
  issuer: string
  date: string
  folder: string
  tags: string[]
  summary: string
  version: string
}
export interface DocumentSearch {
  count(
    user: User,
    scope: AssistantScope,
    filter: DocumentFilter
  ): Promise<number>
  present(
    user: User,
    scope: AssistantScope,
    ids: string[]
  ): Promise<PresentedDocument[]>
  facets(user: User, scope: AssistantScope): Promise<unknown>
  find(
    user: User,
    scope: AssistantScope,
    filter: DocumentFilter,
    offset: number,
    limit: number,
    sort: "newest" | "oldest" | "name"
  ): Promise<{
    documents: DocumentMatch[]
    total: number
    nextOffset: number | null
  }>
  read(
    user: User,
    scope: AssistantScope,
    id: string,
    offset: number,
    length: number
  ): Promise<{
    source: Omit<Citation, "reference">
    totalCharacters: number
    nextOffset: number | null
  }>
  passages(
    user: User,
    scope: AssistantScope,
    query: string,
    filter: DocumentFilter,
    vector?: number[],
    model?: string,
    mode?: "text" | "semantic" | "hybrid"
  ): Promise<Omit<Citation, "reference">[]>
  versions(
    user: User,
    scope: AssistantScope,
    ids: string[]
  ): Promise<Map<string, string>>
}
export interface ConversationStore {
  delete(user: User, id: string): Promise<void>
  create(user: User, scope: AssistantScope): Promise<Conversation>
  list(user: User): Promise<ConversationSummary[]>
  load(user: User, id: string): Promise<Conversation>
  begin(
    user: User,
    id: string,
    messageId: string,
    text: string
  ): Promise<Conversation>
  finish(user: User, id: string, message: ChatMessage): Promise<void>
}
export interface AssistantRuntime {
  run(input: {
    user: User
    history: ChatMessage[]
    signal: AbortSignal
    execute(name: ToolName, input: unknown): Promise<unknown>
    emit(event: AssistantEvent): void
  }): Promise<void>
}
