"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import type {
  AssistantScope,
  ChatMessage,
  ConversationSummary,
} from "@open-file/core/assistant"
import { createAssistant } from "../../bootstrap/create-assistant"
import { createBrowserRuntime } from "../../infrastructure/browser-runtime"
export function useAssistant() {
  const [client] = useState(createAssistant)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [scope, setScope] = useState<AssistantScope>("all")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const reloadList = useCallback(async () => {
    setConversations(await client.list())
  }, [client])
  useEffect(() => {
    let disposed = false
    const lifecycle = generation
    const activeController = controller
    const current = lifecycle.current
    const id = new URLSearchParams(window.location.search).get("conversation")
    Promise.all([client.list(), id ? client.load(id) : Promise.resolve(null)])
      .then(([list, conversation]) => {
        if (disposed || current !== lifecycle.current) return
        setConversations(list)
        if (conversation) {
          setConversationId(conversation.id)
          setScope(conversation.scope)
          setMessages(conversation.messages)
        }
      })
      .catch(() => {
        if (!disposed) setError("Unable to load conversations.")
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
      activeController.current?.abort()
      lifecycle.current++
    }
  }, [client])
  const open = useCallback(
    async (id: string) => {
      if (controller.current) return
      const current = ++generation.current
      setLoading(true)
      setError("")
      try {
        const conversation = await client.load(id)
        if (current !== generation.current) return
        setConversationId(id)
        setScope(conversation.scope)
        setMessages(conversation.messages)
      } catch (e) {
        if (current === generation.current)
          setError(
            e instanceof Error ? e.message : "Unable to load conversation."
          )
      } finally {
        if (current === generation.current) setLoading(false)
      }
    },
    [client]
  )
  function remember(id: string | null) {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("conversation", id)
    else url.searchParams.delete("conversation")
    window.history.replaceState(null, "", url)
  }
  async function select(id: string) {
    remember(id)
    await open(id)
  }
  function start(nextScope: AssistantScope = scope) {
    if (controller.current) return
    generation.current++
    setConversationId(null)
    setMessages([])
    setScope(nextScope)
    setError("")
    setLoading(false)
    remember(null)
  }
  async function send(text: string) {
    if (!text.trim() || controller.current || loading) return false
    const abort = new AbortController()
    controller.current = abort
    const current = generation.current
    setPending(true)
    setError("")
    let activeId = conversationId
    let responseId: string | undefined
    try {
      if (!activeId) {
        const conversation = await client.create(scope)
        activeId = conversation.id
        if (abort.signal.aborted) return false
        setConversationId(activeId)
        remember(activeId)
      }
      const human: ChatMessage = {
        id: createBrowserRuntime().id(),
        role: "user",
        text,
        sources: [],
        tools: [],
        status: "complete",
      }
      setMessages((previous) => [...previous, human])
      await client.send(
        activeId,
        { id: human.id, text },
        abort.signal,
        (event) => {
          if (current !== generation.current) return
          if (event.type === "start") {
            responseId = event.message.id
            setMessages((previous) => [...previous, event.message])
            return
          }
          if (event.type === "notice") setError(event.notice)
          setMessages((previous) =>
            previous.map((message) => {
              if (message.id !== responseId) return message
              if (event.type === "done") return event.message
              if (event.type === "text")
                return { ...message, text: message.text + event.text }
              if (event.type === "documents")
                return { ...message, documents: event.documents }
              if (event.type === "sources")
                return { ...message, sources: event.sources }
              if (event.type === "notice")
                return { ...message, notice: event.notice }
              if (event.type === "tool")
                return {
                  ...message,
                  tools: [
                    ...message.tools.filter((t) => t.id !== event.tool.id),
                    event.tool,
                  ],
                }
              return message
            })
          )
        }
      )
      return true
    } catch (e) {
      if (current === generation.current) {
        setError(
          abort.signal.aborted
            ? "Response stopped."
            : e instanceof Error
              ? e.message
              : "Unable to send message."
        )
        setMessages((previous) =>
          previous.map((m) =>
            m.id === responseId
              ? {
                  ...m,
                  status: abort.signal.aborted ? "interrupted" : "failed",
                }
              : m
          )
        )
        // Reconcile accepted messages after an HTTP rejection or a broken stream.
        if (!abort.signal.aborted && activeId) {
          try {
            const saved = await client.load(activeId)
            if (current === generation.current) setMessages(saved.messages)
          } catch {
            /* Keep the visible partial response. */
          }
        }
      }
      return false
    } finally {
      controller.current = null
      if (current === generation.current) {
        setPending(false)
        void reloadList().catch(() => {})
      }
    }
  }
  return {
    remove: async () => {
      if (!conversationId || pending) return
      if (
        !window.confirm(
          "Permanently delete this conversation and its saved excerpts?"
        )
      )
        return
      try {
        await client.delete(conversationId)
        start()
        await reloadList()
      } catch {
        setError("Unable to delete this conversation.")
      }
    },
    conversations,
    conversationId,
    scope,
    messages,
    pending,
    loading,
    error,
    start,
    select,
    send,
    stop: () => controller.current?.abort(),
    reload: () => (conversationId ? open(conversationId) : undefined),
  }
}
