"use client"
import { matchesCollection } from "../../domain/workspace"
import { useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  Files,
  Inbox,
  Cable,
  FolderCheck,
  Upload,
  Sparkles,
  Check,
  Folder,
  Clock3,
} from "lucide-react"
import { useWorkspace } from "../workspace-context"
import { DocumentDetail } from "../components/document-detail"
import {
  DocumentRow,
  PageHeading,
  PanelHeading,
  Pill,
  StorageIcon,
} from "../components/primitives"
export function Overview() {
  const { state, openImport } = useWorkspace()
  const [detail, setDetail] = useState<string | null>(null)
  const documents = state.documents.filter((d) => d.status !== "archived")
  const pending = documents.filter((d) => d.status === "pending")
  const filed = documents.filter((d) => d.status === "filed")
  const selected = state.documents.find((d) => d.id === detail)
  const metrics = [
    {
      label: "Documents",
      value: documents.length,
      detail: "in your workspace",
      icon: Files,
      href: "/library",
    },
    {
      label: "Needs review",
      value: pending.length,
      detail: "ready to be filed",
      icon: Inbox,
      href: "/inbox",
    },
    {
      label: "Filed",
      value: filed.length,
      detail: "everything in its place",
      icon: FolderCheck,
      href: "/library",
    },
    {
      label: "Connected storage",
      value: state.connectors.filter((c) => c.connected).length,
      detail: "one library",
      icon: Cable,
      href: "/connectors",
    },
  ]
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE ORDER, A LOT OF PEACE OF MIND"
        title={`Hello ${state.settings.name}.`}
        description="Your documents are in the right place. Your mind is at ease."
        actions={<span className="date-chip">Friday, October 2, 2026</span>}
      />
      <div className="metrics-grid">
        {metrics.map(({ label, value, detail, icon: Icon, href }) => (
          <Link href={href} className="metric" key={label}>
            <div className="metric-top">
              <span>
                <Icon size={16} />
                {label}
              </span>
              <ArrowUpRight size={14} />
            </div>
            <div className="metric-value">
              {value}
              <span>
                {label === "Needs review" && value > 0 ? (
                  <span className="metric-dot" />
                ) : null}
              </span>
            </div>
            <p>{detail}</p>
          </Link>
        ))}
      </div>
      <div className="overview-grid">
        <div className="overview-main">
          <section className="panel inbox-panel">
            <PanelHeading
              title="One last look, then it is filed."
              action={
                <Pill tone={pending.length ? "amber" : "green"}>
                  {pending.length
                    ? `${pending.length} to review`
                    : "Up to date"}
                </Pill>
              }
              description="AI has prepared the filing. You have the final say."
            />
            {pending.length ? (
              <div>
                {pending.slice(0, 3).map((document) => (
                  <DocumentRow
                    key={document.id}
                    document={document}
                    onClick={() => setDetail(document.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="all-done">
                <Check size={20} />
                Everything is in order. Enjoy it.
              </div>
            )}
            <div className="panel-footer">
              <span>
                <Sparkles size={14} />
                Names and folders suggested for you
              </span>
              <Link className="text-link" href="/inbox">
                Open inbox
                <ArrowRight size={14} />
              </Link>
            </div>
          </section>
          <section className="panel">
            <PanelHeading
              title="Recently filed"
              action={
                <Link href="/library" className="text-link">
                  View all
                  <ArrowUpRight size={13} />
                </Link>
              }
            />
            {filed.slice(0, 4).map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                onClick={() => setDetail(document.id)}
              />
            ))}
          </section>
          <section>
            <PanelHeading
              title="Your collections"
              action={
                <Link href="/collections" className="text-link">
                  All collections
                  <ArrowUpRight size={13} />
                </Link>
              }
            />
            <div className="collection-mini-grid">
              {state.collections.slice(0, 3).map((c) => (
                <Link
                  href={`/library?collection=${encodeURIComponent(c.id)}`}
                  className="collection-mini"
                  key={c.id}
                >
                  <span className={`folder-tile ${c.color}`}>
                    <Folder size={19} />
                  </span>
                  <strong>{c.name}</strong>
                  <small>
                    {filed.filter((d) => matchesCollection(d, c)).length}{" "}
                    documents
                  </small>
                </Link>
              ))}
            </div>
          </section>
        </div>
        <div className="overview-aside">
          <button className="quick-upload" onClick={() => openImport()}>
            <span className="upload-symbol">
              <Upload size={23} strokeWidth={1.5} />
            </span>
            <strong>Let us help you organize.</strong>
            <p>
              Add a document.
              <br />
              It all starts here.
            </p>
            <span className="fake-button">
              <PlusSmall />
              Import a document
            </span>
            <small>PDF, images, Word, Excel</small>
          </button>
          <section className="assistant-card">
            <div className="assistant-card-icon">
              <Sparkles size={20} strokeWidth={1.5} />
            </div>
            <span className="eyebrow">YOUR DOCUMENT MEMORY</span>
            <h2>
              Your documents have
              <br />
              the answers.
            </h2>
            <p>Ask a question, find what matters. Always with sources.</p>
            <Link
              href="/search?q=What%20is%20the%20warranty%20on%20the%20dishwasher%3F"
              className="suggestion-link"
            >
              “Is my dishwasher still under warranty?”
              <ArrowUpRight size={14} />
            </Link>
            <Link href="/search" className="text-link">
              Talk to the assistant
              <ArrowRight size={14} />
            </Link>
          </section>
          <section className="panel storage-panel">
            <PanelHeading
              title="Everything is connected"
              action={
                <Link href="/connectors" aria-label="View connectors">
                  <ArrowUpRight size={14} />
                </Link>
              }
            />
            {state.connectors
              .filter((c) => c.connected)
              .map((c) => (
                <div className="storage-row" key={c.id}>
                  <StorageIcon name={c.name} />
                  <span>{c.name}</span>
                  <span className="status-dot" />
                </div>
              ))}
            <div className="storage-foot">
              <Clock3 size={12} />
              Connected storage
            </div>
          </section>
        </div>
      </div>
      {selected && (
        <DocumentDetail
          key={selected.id}
          document={selected}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  )
}
function PlusSmall() {
  return <span aria-hidden="true">＋</span>
}
