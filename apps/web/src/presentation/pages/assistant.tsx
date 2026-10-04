"use client"
import { AppSelect } from "../components/app-select"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  ArrowUp,
  Plus,
  FileText,
  ArrowUpRight,
  BookOpen,
  MessageSquare,
  Search,
  Square,
} from "lucide-react"
import { Button } from "@open-file/ui/components/button"
import type { AssistantScope } from "@open-file/core/assistant"
import { useWorkspace } from "../workspace-context"
import { useAssistant } from "../hooks/use-assistant"
import {
  AssistantActivity,
  AssistantText,
  AssistantFiles,
  AssistantSources,
} from "../components/assistant-response"
import { BrandLogo } from "../components/brand-logo"
import { DocumentDetail } from "../components/document-detail"
import { Pill } from "../components/primitives"
export function Assistant() {
  const { state } = useWorkspace()
  const params = useSearchParams()
  const chat = useAssistant()
  const [question, setQuestion] = useState(params.get("q") ?? "")
  const [detail, setDetail] = useState<string | null>(null)
  const selected = state.documents.find((d) => d.id === detail)
  const end = useRef<HTMLDivElement>(null)
  const busy = chat.pending || chat.loading
  const remotelyRunning =
    chat.messages.some((m) => m.status === "running") && !chat.pending
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" })
  }, [chat.messages])
  async function ask(text: string) {
    if (!text.trim() || busy || remotelyRunning) return
    setQuestion("")
    if (!(await chat.send(text))) setQuestion(text)
  }
  return (
    <div className="assistant-page">
      <aside className="assistant-history" aria-label="Conversations">
        <Button
          variant="ghost"
          className="assistant-new-conversation"
          disabled={busy}
          onClick={() => {
            chat.start()
            setQuestion("")
          }}
        >
          <Plus size={16} />
          New conversation
        </Button>
        {chat.conversationId && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void chat.remove()}
          >
            Delete this conversation
          </Button>
        )}
        <span className="assistant-history-heading">Conversations</span>
        <nav
          className="assistant-history-list"
          aria-label="Conversation history"
        >
          {chat.conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              disabled={busy}
              aria-current={
                chat.conversationId === conversation.id ? "page" : undefined
              }
              onClick={() => {
                void chat.select(conversation.id)
                setQuestion("")
              }}
              title={conversation.title}
            >
              <span className="assistant-history-meta">
                <MessageSquare size={13} />
                <span className="assistant-history-title">
                  {conversation.title}
                </span>
                <time dateTime={conversation.updatedAt}>
                  {new Date(conversation.updatedAt).toLocaleDateString(
                    undefined,
                    { month: "short", day: "numeric" }
                  )}
                </time>
              </span>
            </button>
          ))}
          {!chat.conversations.length && !chat.loading && (
            <p>No conversations yet</p>
          )}
        </nav>
      </aside>
      <div className="assistant-chat">
        <div
          className={`conversation ${chat.messages.length ? "has-messages" : ""}`}
        >
          {chat.loading ? (
            <p role="status">Loading conversation…</p>
          ) : !chat.messages.length && !chat.pending ? (
            <div className="assistant-welcome">
              <h2>
                The answer is in there somewhere.
                <br />
                <span>Let&apos;s find it together.</span>
              </h2>
              <p>
                Find a document, understand a clause, or ask a follow-up.
                <br />
                Your assistant searches when it needs to.
              </p>
              <div className="prompt-grid">
                {[
                  {
                    label: "Find information",
                    text: "What is the warranty on the dishwasher?",
                    icon: Search,
                  },
                  {
                    label: "Understand a contract",
                    text: "What is the notice period for my lease?",
                    icon: FileText,
                  },
                  {
                    label: "Get an overview",
                    text: "Find my most recent invoices.",
                    icon: BookOpen,
                  },
                ].map(({ label, text, icon: Icon }) => (
                  <button key={text} onClick={() => void ask(text)}>
                    <Icon size={17} />
                    <strong>{label}</strong>
                    <span>{text}</span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {chat.messages.map((message) =>
                message.role === "user" ? (
                  <div className="user-message" key={message.id}>
                    <span className="avatar small">You</span>
                    <p>{message.text}</p>
                  </div>
                ) : (
                  <div className="assistant-message" key={message.id}>
                    <span className="answer-mark">
                      <BrandLogo variant="icon" decorative />
                    </span>
                    <div>
                      <strong>Open File</strong>
                      <AssistantActivity message={message} onOpen={setDetail} />
                      <AssistantText
                        text={message.text}
                        sources={message.sources}
                        onOpen={setDetail}
                      />
                      <AssistantFiles
                        documents={message.documents ?? []}
                        onOpen={setDetail}
                      />
                      {message.notice && (
                        <p role="status" className="error-text">
                          {message.notice}
                        </p>
                      )}
                      {(message.status === "interrupted" ||
                        message.status === "failed") && (
                        <Pill>
                          {message.status === "interrupted"
                            ? "Interrupted"
                            : "Failed"}
                        </Pill>
                      )}
                      <AssistantSources
                        sources={message.sources}
                        onOpen={setDetail}
                      />
                    </div>
                  </div>
                )
              )}
              <div ref={end} />
            </div>
          )}
        </div>
        <div className="composer-wrap">
          {chat.error && (
            <p role="alert" className="error-text">
              {chat.error}
            </p>
          )}
          {remotelyRunning && (
            <p role="status">
              A response is in progress.{" "}
              <button onClick={() => void chat.reload()}>
                Refresh conversation
              </button>
            </p>
          )}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              void ask(question)
            }}
          >
            <textarea
              aria-label="Your question"
              placeholder="Ask your documents a question…"
              value={question}
              maxLength={8000}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void ask(question)
                }
              }}
              rows={2}
            />
            <div>
              <label className="assistant-composer-scope">
                <BookOpen size={15} aria-hidden="true" />
                <AppSelect
                  aria-label="Search scope"
                  value={chat.scope}
                  disabled={busy}
                  onValueChange={(value) => chat.start(value as AssistantScope)}
                  options={[
                    { value: "all", label: "Entire library" },
                    { value: "Google Drive", label: "Google Drive" },
                    { value: "Local", label: "Local" },
                  ]}
                />
              </label>
              {chat.pending ? (
                <Button
                  size="icon"
                  type="button"
                  aria-label="Stop response"
                  onClick={chat.stop}
                >
                  <Square size={15} />
                </Button>
              ) : (
                <Button
                  size="icon"
                  type="submit"
                  aria-label="Send question"
                  disabled={!question.trim() || busy || remotelyRunning}
                >
                  <ArrowUp size={17} />
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
      {selected && (
        <DocumentDetail
          key={selected.id}
          document={selected}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
