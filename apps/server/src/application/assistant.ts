import type {
  AssistantEvent,
  ChatMessage,
  Citation,
  ToolName,
  PresentedDocument,
} from "@open-file/core/assistant"
import type {
  AssistantRuntime,
  ConversationStore,
  DocumentSearch,
} from "./assistant-ports"
import type { Intelligence, SecretStore } from "./ports"
import { AppError, type User } from "../domain/model"
import { toolSchemas } from "./assistant-tools"
export class Assistant {
  constructor(
    readonly conversations: ConversationStore,
    private search: DocumentSearch,
    private intelligence: Pick<Intelligence, "embed">,
    private secrets: SecretStore,
    private runtime: AssistantRuntime
  ) {}
  async prepare(user: User, id: string, messageId: string, text: string) {
    return this.conversations.begin(user, id, messageId, text)
  }
  async run(
    user: User,
    conversation: Awaited<ReturnType<Assistant["prepare"]>>,
    signal: AbortSignal,
    send: (event: AssistantEvent) => void
  ) {
    const message = conversation.messages.at(-1)!
    const history = conversation.messages.slice(0, -1)
    let calls = 0
    let outputCharacters = 0
    const sources: Citation[] = []
    const displayed = new Map<string, PresentedDocument>()
    const emit = (event: AssistantEvent) => {
      if (event.type === "text") message.text += event.text
      if (event.type === "tool") {
        const index = message.tools.findIndex((t) => t.id === event.tool.id)
        if (index < 0) message.tools.push(event.tool)
        else message.tools[index] = event.tool
      }
      if (event.type === "notice") message.notice = event.notice
      send(event)
    }
    const cite = (source: Omit<Citation, "reference">) => {
      const existing = sources.find(
        (s) =>
          s.id === source.id &&
          s.start === source.start &&
          s.excerpt === source.excerpt
      )
      if (existing) return existing
      const result = { ...source, reference: `S${sources.length + 1}` }
      sources.push(result)
      emit({ type: "sources", sources: [...sources] })
      return result
    }
    const executeOne = async (
      name: ToolName,
      input: unknown
    ): Promise<unknown> => {
      signal.throwIfAborted()
      if (++calls > 12 || outputCharacters >= 60000)
        return {
          error:
            "Tool budget reached. Answer with the available evidence, and explain any incomplete search.",
        }
      let result: unknown
      if (name === "listFacets") {
        toolSchemas.listFacets.parse(input)
        result = await this.search.facets(user, conversation.scope)
      } else if (name === "countDocuments") {
        const { filter } = toolSchemas.countDocuments.parse(input)
        result = {
          count: await this.search.count(user, conversation.scope, filter),
          filter,
          scope: conversation.scope,
          exact: true,
        }
      } else if (name === "displayDocuments") {
        const { ids } = toolSchemas.displayDocuments.parse(input)
        const documents = await this.search.present(user, conversation.scope, [
          ...new Set(ids),
        ])
        for (const document of documents) {
          if (displayed.size >= 24 && !displayed.has(document.id)) break
          displayed.set(document.id, document)
          cite({
            id: document.id,
            name: document.name,
            version: document.version,
            excerpt: `${document.folder}; ${document.date}; ${document.storage}`,
          })
        }
        emit({ type: "documents", documents: [...displayed.values()] })
        result = {
          documents: documents.filter((d) => displayed.has(d.id)),
          unavailableIds: ids.filter(
            (id) => !documents.some((d) => d.id === id)
          ),
          displayLimit: 24,
        }
      } else if (name === "findDocuments") {
        const { filter, offset, limit, sort } =
          toolSchemas.findDocuments.parse(input)
        const found = await this.search.find(
          user,
          conversation.scope,
          filter,
          offset,
          limit,
          sort
        )
        result = {
          ...found,
          documents: found.documents.map((d) => ({
            ...d,
            reference: cite({
              id: d.id,
              name: d.name,
              version: d.version,
              excerpt: `${d.kind}; ${d.date}; ${d.issuer}; ${d.summary}`,
            }).reference,
          })),
        }
      } else if (name === "readDocument") {
        const { id, offset, length } = toolSchemas.readDocument.parse(input)
        const found = await this.search.read(
          user,
          conversation.scope,
          id,
          offset,
          length
        )
        result = { ...found, source: cite(found.source) }
      } else {
        const { query, filter, mode } = toolSchemas.searchPassages.parse(input)
        let embedding: Awaited<ReturnType<Intelligence["embed"]>>
        try {
          if (mode !== "text")
            embedding = await this.intelligence.embed(user.id, [query], signal)
        } catch {
          emit({
            type: "notice",
            notice:
              "Semantic search is unavailable. Continuing with text search.",
          })
        }
        signal.throwIfAborted()
        result = {
          passages: (
            await this.search.passages(
              user,
              conversation.scope,
              query,
              filter,
              embedding?.vectors[0],
              embedding?.model,
              embedding ? mode : "text"
            )
          ).map(cite),
          exhaustive: false,
        }
      }
      signal.throwIfAborted()
      const size = JSON.stringify(result).length
      if (size + outputCharacters > 60000)
        return {
          error:
            "Result too large for the remaining context. Request fewer documents or a shorter excerpt.",
        }
      outputCharacters += size
      return result
    }
    // Serialize tool execution so parallel model calls share a real global budget.
    let queue: Promise<unknown> = Promise.resolve()
    const execute = (name: ToolName, input: unknown) => {
      const next = queue.then(() => executeOne(name, input))
      queue = next.catch(() => {})
      return next
    }
    emit({ type: "start", message: { ...message } })
    try {
      // Revalidate old references before using history; archived or changed
      // content must be retrieved again rather than treated as current evidence.
      const previousSources = history.flatMap((m) => m.sources)
      const versions = await this.search.versions(
        user,
        conversation.scope,
        previousSources.map((s) => s.id)
      )
      const context: ChatMessage[] = []
      let remaining = 40000
      for (const old of history.slice().reverse()) {
        if (old.status !== "complete") continue
        const stale = old.sources.some((s) => versions.get(s.id) !== s.version)
        const text = stale
          ? "[Previous document answer omitted: its sources changed or are no longer available. Search again.]"
          : old.text
        const references = stale
          ? []
          : old.sources.map((s) => ({ ...s, excerpt: "" }))
        const cost = text.length + JSON.stringify(references).length
        if (cost > remaining) break
        context.unshift({ ...old, text, sources: references, tools: [] })
        remaining -= cost
        if (context.length >= 30) break
      }
      const settings = await this.secrets.get(user.id)
      if (settings.ai.enabled && settings.aiKey) {
        await this.runtime.run({
          user,
          history: context,
          signal,
          execute,
          emit,
        })
      } else {
        const query = history.at(-1)!.text
        const found = await this.search.passages(
          user,
          conversation.scope,
          query,
          {}
        )
        found.forEach(cite)
        emit({
          type: "text",
          text: found.length
            ? "AI disabled: here are the passages found using text search."
            : "AI disabled: no matching passages were found using text search.",
        })
      }
      signal.throwIfAborted()
      if (!message.text.trim())
        emit({
          type: "text",
          text: "I could not complete an answer within this turn. Please narrow your question or ask me to continue.",
        })
      // Unknown reference markers are never presented as validated citations.
      message.text = message.text.replace(/\[S\d+\]/g, (token) =>
        sources.some((s) => `[${s.reference}]` === token)
          ? token
          : "[unverified source]"
      )
      message.status = "complete"
    } catch (error) {
      message.status = signal.aborted ? "interrupted" : "failed"
      message.notice = signal.aborted
        ? "Response interrupted. You can send another message to continue."
        : error instanceof AppError
          ? error.message
          : "The assistant could not complete this response. Please try again."
      for (const record of message.tools)
        if (record.status === "running") record.status = "failed"
    } finally {
      await queue
      message.sources = sources
      message.documents = [...displayed.values()]
      await this.conversations.finish(user, conversation.id, message)
      send({ type: "done", message })
    }
  }
}
