import { test } from "node:test"
import assert from "node:assert/strict"
import { MockLanguageModelV4 } from "ai/test"
import { simulateReadableStream } from "ai"
import { SdkAssistantRuntime } from "../src/infrastructure/assistant-agent"
import { Assistant } from "../src/application/assistant"
import type { SecretStore } from "../src/application/ports"
import type {
  AssistantRuntime,
  ConversationStore,
  DocumentSearch,
} from "../src/application/assistant-ports"
import type {
  AssistantEvent,
  ChatMessage,
  Conversation,
  ToolName,
} from "@open-file/core/assistant"
import { defaultSecrets } from "../src/domain/model"
const user = { id: "alice", name: "Alice", email: "alice@example.com" }
const secrets: SecretStore = {
  async get() {
    return {
      ...defaultSecrets(),
      ai: { ...defaultSecrets().ai, enabled: true },
      aiKey: "test-not-a-real-key",
    }
  },
  async update() {
    throw new Error("Unused")
  },
}
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
}
function textStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        { type: "text-start" as const, id: "text" },
        { type: "text-delta" as const, id: "text", delta: text },
        { type: "text-end" as const, id: "text" },
        {
          type: "finish" as const,
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage,
        },
      ],
    }),
  }
}
function message(
  text: string,
  role: "user" | "assistant" = "user"
): ChatMessage {
  return {
    id: Math.random().toString(),
    role,
    text,
    status: "complete",
    sources: [],
    tools: [],
  }
}
test("SDK agent can clarify without searching and receives conversation history", async () => {
  const model = new MockLanguageModelV4({
    doStream: textStream("Habitation ou automobile ?"),
  })
  const events: AssistantEvent[] = []
  await new SdkAssistantRuntime(secrets, model).run({
    user,
    history: [message("Trouve mon assurance")],
    signal: new AbortController().signal,
    execute: async () => {
      assert.fail("No tool needed")
    },
    emit: (e) => events.push(e),
  })
  assert.equal(model.doStreamCalls.length, 1)
  assert.ok(
    events.some((e) => e.type === "text" && e.text.includes("Habitation"))
  )
  assert.match(
    JSON.stringify(model.doStreamCalls[0]?.prompt),
    /Trouve mon assurance/
  )
})
test("SDK agent executes metadata search then reads a document and answers", async () => {
  const toolStream = (name: ToolName, input: unknown) => ({
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start" as const, warnings: [] },
        {
          type: "tool-call" as const,
          toolCallId: name,
          toolName: name,
          input: JSON.stringify(input),
        },
        {
          type: "finish" as const,
          finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
          usage,
        },
      ],
    }),
  })
  const model = new MockLanguageModelV4({
    doStream: [
      toolStream("findDocuments", {
        filter: { tags: ["Housing"] },
        offset: 0,
        limit: 10,
        sort: "newest",
      }),
      toolStream("readDocument", { id: "lease", offset: 0, length: 100 }),
      textStream("Le préavis est de trois mois [S1]."),
    ],
  })
  const calls: ToolName[] = []
  const events: AssistantEvent[] = []
  await new SdkAssistantRuntime(secrets, model).run({
    user,
    history: [
      message("Trouve mon bail"),
      message("Lequel ?", "assistant"),
      message("Le plus récent, quel est le préavis ?"),
    ],
    signal: new AbortController().signal,
    execute: async (name) => {
      calls.push(name)
      return name === "findDocuments"
        ? { documents: [{ id: "lease" }] }
        : { text: "Préavis : trois mois", reference: "S1" }
    },
    emit: (e) => events.push(e),
  })
  assert.deepEqual(calls, ["findDocuments", "readDocument"])
  assert.equal(model.doStreamCalls.length, 3)
  assert.match(
    JSON.stringify(model.doStreamCalls[2]?.prompt),
    /Préavis : trois mois/
  )
  assert.ok(
    events.some((e) => e.type === "tool" && e.tool.status === "complete")
  )
})
function fixture(runtime: AssistantRuntime, embeddingFails = false) {
  let saved: ChatMessage | undefined
  let embedded = 0
  const store: ConversationStore = {
    async delete() {},
    async create() {
      throw new Error("Unused")
    },
    async list() {
      return []
    },
    async load() {
      throw new Error("Unused")
    },
    async begin() {
      throw new Error("Unused")
    },
    async finish(_user, _id, m) {
      saved = m
    },
  }
  const search: DocumentSearch = {
    async count() {
      return 42
    },
    async present() {
      return [
        {
          id: "lease",
          name: "Lease.pdf",
          folder: "Home",
          storage: "Local",
          size: "2 KB",
          mimeType: "application/pdf",
          date: "2026-01-01",
          version: "v1",
        },
      ]
    },
    async facets() {
      return { values: [] }
    },
    async find() {
      return {
        documents: [
          {
            id: "lease",
            name: "Lease",
            kind: "Contract",
            issuer: "Owner",
            date: "2026-01-01",
            folder: "Home",
            tags: [],
            summary: "Lease",
            version: "v1",
          },
        ],
        total: 1,
        nextOffset: null,
      }
    },
    async read() {
      return {
        source: {
          id: "lease",
          name: "Lease",
          excerpt: "Three months",
          version: "v1",
          start: 0,
        },
        totalCharacters: 12,
        nextOffset: null,
      }
    },
    async passages() {
      return [
        { id: "lease", name: "Lease", excerpt: "Three months", version: "v1" },
      ]
    },
    async versions() {
      return new Map()
    },
  }
  const assistant = new Assistant(
    store,
    search,
    {
      async embed() {
        embedded++
        if (embeddingFails) throw new Error("offline")
        return undefined
      },
    },
    secrets,
    runtime
  )
  const conversation: Conversation = {
    id: "conversation",
    title: "Lease",
    updatedAt: "",
    scope: "Local",
    messages: [
      message("What is the notice period?"),
      { ...message("", "assistant"), status: "running" },
    ],
  }
  return {
    assistant,
    conversation,
    saved: () => saved!,
    embedded: () => embedded,
  }
}
test("application performs embeddings only for passage search and preserves text fallback", async () => {
  const f = fixture(
    {
      async run({ execute, emit }) {
        await execute("findDocuments", { filter: {} })
        assert.equal(f.embedded(), 0)
        await execute("searchPassages", { query: "notice", filter: {} })
        emit({ type: "text", text: "Three months [S2]. Unknown [S999]." })
      },
    },
    true
  )
  await f.assistant.run(
    user,
    f.conversation,
    new AbortController().signal,
    () => {}
  )
  assert.equal(f.embedded(), 1)
  assert.equal(f.saved().status, "complete")
  assert.match(f.saved().notice!, /Semantic search/)
  assert.match(f.saved().text, /\[S2\]/)
  assert.doesNotMatch(f.saved().text, /S999/)
  assert.equal(f.saved().sources.length, 2)
})
test("stale references are excluded from model context, interruption is persisted", async () => {
  const controller = new AbortController()
  const f = fixture({
    async run({ history, emit }) {
      assert.doesNotMatch(JSON.stringify(history), /CONFIDENTIAL/)
      emit({ type: "text", text: "Partial answer" })
      controller.abort()
    },
  })
  f.conversation.messages.unshift({
    ...message("CONFIDENTIAL", "assistant"),
    sources: [
      {
        reference: "S1",
        id: "archived",
        name: "Old",
        excerpt: "CONFIDENTIAL",
        version: "old",
      },
    ],
  })
  await f.assistant.run(user, f.conversation, controller.signal, () => {})
  assert.equal(f.saved().status, "interrupted")
  assert.equal(f.saved().text, "Partial answer")
})
test("tool calls are bounded even if a runtime repeatedly requests tools", async () => {
  const f = fixture({
    async run({ execute }) {
      for (let i = 0; i < 12; i++) await execute("listFacets", {})
      assert.match(
        JSON.stringify(await execute("listFacets", {})),
        /budget reached/
      )
    },
  })
  await f.assistant.run(
    user,
    f.conversation,
    new AbortController().signal,
    () => {}
  )
  assert.match(f.saved().text, /could not complete/)
})

test("counting, display and keyword-only search never compute embeddings", async () => {
  const events: AssistantEvent[] = []
  const f = fixture({
    async run({ execute, emit }) {
      assert.deepEqual(
        await execute("countDocuments", {
          filter: { folder: "Home", includeSubfolders: false },
        }),
        {
          count: 42,
          filter: { folder: "Home", includeSubfolders: false },
          scope: "Local",
          exact: true,
        }
      )
      await execute("displayDocuments", { ids: ["lease", "missing"] })
      await execute("searchPassages", {
        query: "notice",
        filter: {},
        mode: "text",
      })
      emit({ type: "text", text: "Here is your lease [S1]." })
    },
  })
  await f.assistant.run(
    user,
    f.conversation,
    new AbortController().signal,
    (e) => events.push(e)
  )
  assert.equal(f.embedded(), 0)
  assert.equal(f.saved().documents?.[0]?.id, "lease")
  assert.ok(
    events.some(
      (e) => e.type === "documents" && e.documents[0]?.name === "Lease.pdf"
    )
  )
})

test("empty filename lookup forces diverse recovery before a final answer", async () => {
  const { AssistantSearchPolicy } =
    await import("../src/infrastructure/assistant-search-policy")
  const policy = new AssistantSearchPolicy()
  assert.equal(policy.next(), undefined)
  policy.observe("countDocuments", { count: 0 })
  assert.equal(policy.next(), undefined)
  policy.observe("findDocuments", { total: 0, documents: [] })
  assert.equal(policy.next(), "searchPassages")
  policy.observe("searchPassages", { passages: [] })
  assert.equal(policy.next(), "listFacets")
  policy.observe("listFacets", { values: [] })
  assert.equal(policy.next(), "findDocuments")
  policy.observe("findDocuments", { total: 0, documents: [] })
  assert.equal(policy.next(), undefined)

  const found = new AssistantSearchPolicy()
  found.observe("findDocuments", { total: 0 })
  found.observe("searchPassages", { passages: [{ id: "lab" }] })
  assert.equal(found.next(), undefined)
})

test("SDK tool choice enforces recovery, then releases the agent to read and answer", async () => {
  const expected = [
    "findDocuments",
    "searchPassages",
    "listFacets",
    "findDocuments",
  ] as const
  let step = 0
  const model = new MockLanguageModelV4({
    doStream: async (request) => {
      const name = expected[step]
      if (step > 0 && step < 4)
        assert.deepEqual(request.toolChoice, { type: "tool", toolName: name })
      if (step === 4) {
        assert.deepEqual(request.toolChoice, { type: "auto" })
        return textStream("Un document a été retrouvé.")
      }
      step++
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start" as const, warnings: [] },
            {
              type: "tool-call" as const,
              toolCallId: `call-${step}`,
              toolName: name!,
              input: JSON.stringify(
                name === "listFacets"
                  ? {}
                  : name === "searchPassages"
                    ? { query: "laboratory results", filter: {} }
                    : { filter: {} }
              ),
            },
            {
              type: "finish" as const,
              finishReason: {
                unified: "tool-calls" as const,
                raw: "tool_calls",
              },
              usage,
            },
          ],
        }),
      }
    },
  })
  await new SdkAssistantRuntime(secrets, model).run({
    user,
    history: [message("Find my lab reports")],
    signal: new AbortController().signal,
    execute: async (name) =>
      name === "findDocuments"
        ? { total: step === 4 ? 1 : 0, documents: [] }
        : name === "searchPassages"
          ? { passages: [] }
          : { values: [{ value: "Lab results" }] },
    emit: () => {},
  })
  assert.equal(model.doStreamCalls.length, 5)
})
