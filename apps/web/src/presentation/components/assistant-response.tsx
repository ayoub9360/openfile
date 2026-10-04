"use client"
import * as React from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  ChevronRight,
  CircleAlert,
  Eye,
  FileText,
  Files,
  FolderOpen,
  Hash,
  Lightbulb,
  LoaderCircle,
  Search,
  ArrowUpRight,
} from "lucide-react"
import type {
  ChatMessage,
  Citation,
  PresentedDocument,
  ToolName,
} from "@open-file/core/assistant"
import {
  describeOperation,
  toolLabels,
} from "../../application/assistant-display"
interface MarkdownNode {
  type: string
  value?: string
  url?: string
  children?: MarkdownNode[]
}
// Add links only for validated references in text nodes, never inside code/links.
function citationPlugin(sources: Citation[]) {
  return () => (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children || ["link", "code", "inlineCode"].includes(node.type))
        return
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value) {
          visit(child)
          return [child]
        }
        return child.value
          .split(/(\[S\d+\])/g)
          .filter(Boolean)
          .map((value) => {
            const source = sources.find((s) => `[${s.reference}]` === value)
            return source
              ? {
                  type: "link",
                  url: `#document-source-${source.reference}`,
                  children: [{ type: "text", value: source.name }],
                }
              : { type: "text", value }
          })
      })
    }
    visit(tree)
  }
}
export function AssistantText({
  text,
  sources,
  onOpen,
}: {
  text: string
  sources: Citation[]
  onOpen: (id: string) => void
}) {
  return (
    <div className="answer-text assistant-markdown">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm, citationPlugin(sources)]}
        components={{
          a: ({ href, children }) => {
            const reference = href?.match(/^#document-source-(S\d+)$/)?.[1]
            const source = sources.find((s) => s.reference === reference)
            return source ? (
              <button
                type="button"
                className="assistant-citation"
                title={`${source.name}\n\n${source.excerpt.slice(0, 500)}`}
                onClick={() => onOpen(source.id)}
                aria-label={`Open source ${source.reference}: ${source.name}`}
              >
                <FileText size={11} />
                <span>{source.name}</span>
              </button>
            ) : (
              <span>{children}</span>
            )
          },
          img: () => null,
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}
const icons: Record<ToolName, typeof Search> = {
  listFacets: FolderOpen,
  findDocuments: Search,
  searchPassages: Search,
  readDocument: Eye,
  countDocuments: Hash,
  displayDocuments: Files,
}
export function AssistantActivity({
  message,
  onOpen,
}: {
  message: ChatMessage
  onOpen: (id: string) => void
}) {
  const running = message.status === "running"
  if (!message.tools.length && !running) return null
  return (
    <div className="assistant-activity" aria-label="Assistant activity">
      <ol className="assistant-activity-list">
        {message.tools.map((tool) => {
          const { title, detail, links } = describeOperation(tool)
          const Icon = icons[tool.name]
          const active = tool.status === "running" && running
          const failed =
            tool.status === "failed" || (tool.status === "running" && !running)
          const hasIntent = title !== toolLabels[tool.name]
          return (
            <li key={tool.id} className={active ? "is-running" : ""}>
              {hasIntent && (
                <div className="assistant-activity-intent">
                  <Lightbulb size={15} aria-hidden="true" />
                  <span>{title}</span>
                </div>
              )}
              <div className="assistant-activity-action">
                {active ? (
                  <LoaderCircle
                    size={15}
                    className="assistant-spinner"
                    aria-hidden="true"
                  />
                ) : failed ? (
                  <CircleAlert size={15} aria-hidden="true" />
                ) : (
                  <Icon size={15} aria-hidden="true" />
                )}
                <div className="assistant-activity-content">
                  <span>{toolLabels[tool.name]}</span>
                  {links.map((link) => (
                    <button
                      className="assistant-activity-file"
                      type="button"
                      key={link.id}
                      title={link.name}
                      onClick={() => onOpen(link.id)}
                    >
                      <FileText size={12} aria-hidden="true" />
                      <span>{link.name}</span>
                    </button>
                  ))}
                  {failed ? (
                    <span className="assistant-activity-detail">
                      Unavailable or interrupted
                    </span>
                  ) : tool.status === "complete" &&
                    detail &&
                    tool.name !== "readDocument" ? (
                    <span className="assistant-activity-detail">{detail}</span>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
        {running && !message.tools.some((t) => t.status === "running") && (
          <li className="assistant-activity-pending" role="status">
            <LoaderCircle
              size={15}
              className="assistant-spinner"
              aria-hidden="true"
            />
            <span>Preparing your answer…</span>
          </li>
        )}
      </ol>
    </div>
  )
}

function FilePreview({
  document,
  onOpen,
}: {
  document: PresentedDocument
  onOpen: (id: string) => void
}) {
  const [failed, setFailed] = React.useState(false)
  const preview =
    document.mimeType === "application/pdf" ||
    document.mimeType?.startsWith("image/")
  return (
    <button
      type="button"
      className="assistant-file-card"
      onClick={() => onOpen(document.id)}
      aria-label={`Open file ${document.name}`}
    >
      <span className="assistant-file-preview">
        {preview && !failed ? (
          <>
            {/* The authenticated endpoint supplies a resized thumbnail, as in DocumentCard. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              decoding="async"
              src={`/api/documents/${encodeURIComponent(document.id)}/preview`}
              alt=""
              onError={() => setFailed(true)}
            />
          </>
        ) : (
          <FileText size={32} strokeWidth={1.25} />
        )}
        <span className="assistant-file-format">
          {document.name.split(".").pop()?.toUpperCase().slice(0, 8) || "FILE"}
        </span>
      </span>
      <span className="assistant-file-info">
        <strong title={document.name}>{document.name}</strong>
        <small title={document.folder}>{document.folder}</small>
        <span>
          <small>
            {document.storage} · {document.size}
          </small>
          <ArrowUpRight size={13} />
        </span>
      </span>
    </button>
  )
}
export function AssistantFiles({
  documents,
  onOpen,
}: {
  documents: PresentedDocument[]
  onOpen: (id: string) => void
}) {
  if (!documents.length) return null
  return (
    <section
      className="assistant-files"
      aria-label="Files shared by the assistant"
    >
      <p>
        {documents.length} file{documents.length === 1 ? "" : "s"}
      </p>
      <div className="assistant-file-grid">
        {documents.map((document) => (
          <FilePreview key={document.id} document={document} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}
export function AssistantSources({
  sources,
  onOpen,
}: {
  sources: Citation[]
  onOpen: (id: string) => void
}) {
  const unique = sources.filter(
    (s, i) => sources.findIndex((other) => other.id === s.id) === i
  )
  if (!unique.length) return null
  return (
    <details className="assistant-source-list">
      <summary>
        <Files size={13} />
        {unique.length} source{unique.length === 1 ? "" : "s"} consulted
        <ChevronRight size={13} />
      </summary>
      <div className="source-cards">
        {unique.map((source) => (
          <button key={source.id} onClick={() => onOpen(source.id)}>
            <FileText size={16} />
            <span>
              <strong>{source.name}</strong>
              <small>{source.excerpt.slice(0, 220)}</small>
            </span>
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
    </details>
  )
}
