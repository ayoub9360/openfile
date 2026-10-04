import type { AssistantClient } from "../application/assistant-client"
import type {
  AssistantEvent,
  AssistantScope,
  Conversation,
  ConversationSummary,
} from "@open-file/core/assistant"
import { request } from "./http-workspace"
export class HttpAssistant implements AssistantClient {
  delete(id: string) {
    return request(`/conversations/${encodeURIComponent(id)}`, "DELETE")
  }
  list() {
    return request<ConversationSummary[]>("/conversations")
  }
  create(scope: AssistantScope) {
    return request<Conversation>("/conversations", "POST", { scope })
  }
  load(id: string) {
    return request<Conversation>(`/conversations/${encodeURIComponent(id)}`)
  }
  async send(
    id: string,
    message: { id: string; text: string },
    signal: AbortSignal,
    onEvent: (event: AssistantEvent) => void
  ) {
    const response = await fetch(
      `/api/conversations/${encodeURIComponent(id)}/messages`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
        signal,
      }
    )
    if (!response.ok) {
      const body = await response.json()
      throw new Error(body.error ?? "Unable to send this message.")
    }
    if (!response.body) throw new Error("The response stream is unavailable.")
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let completed = false
    const consume = (line: string) => {
      if (!line.trim()) return
      const event = JSON.parse(line) as AssistantEvent
      if (event.type === "done") completed = true
      onEvent(event)
    }
    try {
      while (true) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        let newline: number
        while ((newline = buffer.indexOf("\n")) >= 0) {
          consume(buffer.slice(0, newline))
          buffer = buffer.slice(newline + 1)
        }
        if (done) {
          consume(buffer)
          break
        }
      }
      if (!completed)
        throw new Error(
          "The connection was interrupted. Reload the conversation to check its status."
        )
    } finally {
      reader.releaseLock()
    }
  }
}
