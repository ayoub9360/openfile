import type { AssistantClient } from "../application/assistant-client"
import { HttpAssistant } from "../infrastructure/http-assistant"
export function createAssistant(): AssistantClient {
  return new HttpAssistant()
}
