import { test } from "node:test"
import assert from "node:assert/strict"
import type { AssistantEvent, ChatMessage } from "@open-file/core/assistant"
import { HttpAssistant } from "../infrastructure/http-assistant"
const message: ChatMessage = {
  id: "answer",
  role: "assistant",
  text: "Réponse €",
  sources: [],
  tools: [],
  status: "complete",
}
test("assistant transport preserves fragmented UTF-8 events and sends only the new message", async (t) => {
  const data = new TextEncoder().encode(
    [
      JSON.stringify({ type: "text", text: "Réponse €" }),
      "",
      JSON.stringify({ type: "done", message }),
    ].join("\n")
  )
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      assert.deepEqual(JSON.parse(String(init.body)), {
        id: "user-message",
        text: "Question",
      })
      assert.equal(init.credentials, "same-origin")
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of data) controller.enqueue(Uint8Array.of(byte))
            controller.close()
          },
        })
      )
    }
  )
  const events: AssistantEvent[] = []
  await new HttpAssistant().send(
    "conversation",
    { id: "user-message", text: "Question" },
    new AbortController().signal,
    (e) => events.push(e)
  )
  assert.deepEqual(events, [
    { type: "text", text: "Réponse €" },
    { type: "done", message },
  ])
})
test("assistant transport detects truncated streams and HTTP rejections", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response('{"type":"text","text":"Partial"}\n')
  )
  const send = () =>
    new HttpAssistant().send(
      "conversation",
      { id: "user-message", text: "Question" },
      new AbortController().signal,
      () => {}
    )
  await assert.rejects(send(), /interrupted/)
  fetch.mock.mockImplementation(async () =>
    Response.json({ error: "Already running" }, { status: 409 })
  )
  await assert.rejects(send(), /Already running/)
})
