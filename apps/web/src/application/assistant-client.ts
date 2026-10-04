import type {
  AssistantEvent,
  AssistantScope,
  Conversation,
  ConversationSummary,
} from "@open-file/core/assistant"
export interface AssistantClient {
  delete(id: string): Promise<unknown>
  list(): Promise<ConversationSummary[]>
  create(scope: AssistantScope): Promise<Conversation>
  load(id: string): Promise<Conversation>
  send(
    id: string,
    message: { id: string; text: string },
    signal: AbortSignal,
    onEvent: (event: AssistantEvent) => void
  ): Promise<void>
}
