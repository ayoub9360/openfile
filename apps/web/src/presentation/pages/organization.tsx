"use client"
import { useState } from "react"
import Link from "next/link"
import {
  Plus,
  Pencil,
  X,
  Folder,
  ArrowUpRight,
  RefreshCw,
  Cable,
  FileText,
} from "lucide-react"
import { Button } from "@open-file/ui/components/button"
import {
  collectionTags,
  matchesCollection,
  type Collection,
} from "../../domain/workspace"
import { useWorkspace } from "../workspace-context"
import {
  PageHeading,
  Pill,
  Modal,
  StorageIcon,
  dateLabel,
} from "../components/primitives"
export function Collections() {
  const { state, service, run } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Collection | null>(null)
  const [name, setName] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const selectedTags = [...new Set([...tags, tagInput.trim()].filter(Boolean))]
  const suggestions = [
    ...new Set(state.documents.flatMap((d) => d.tags)),
  ].filter((tag) => !tags.includes(tag))
  const previewCount = state.documents.filter(
    (d) =>
      d.status === "filed" && selectedTags.some((tag) => d.tags.includes(tag))
  ).length
  function start(collection: Collection | null = null) {
    setEditing(collection)
    setName(collection?.name ?? "")
    setDescription(collection?.description ?? "")
    setTags(collection ? collectionTags(collection) : [])
    setTagInput("")
    setError("")
    setOpen(true)
  }
  function addTag(value: string) {
    const tag = value.trim()
    if (!tag) return
    if (tag.length > 80 || (!tags.includes(tag) && tags.length >= 20)) {
      setError("Choose up to 20 tags, with at most 80 characters each.")
      return
    }
    setTags((current) => [...new Set([...current, tag])])
    setTagInput("")
    setError("")
  }
  return (
    <>
      <PageHeading
        title="Things that belong together"
        description="Group documents automatically by their tags. Choose the tags; your collection stays up to date."
        actions={
          <Button onClick={() => start()}>
            <Plus size={15} />
            Create a collection
          </Button>
        }
      />
      <div className="collections-grid">
        {state.collections.map((c) => {
          const docs = state.documents.filter(
            (d) => d.status === "filed" && matchesCollection(d, c)
          )
          return (
            <section className="collection-card" key={c.id} aria-label={c.name}>
              <div className="collection-top">
                <span className={`folder-tile large ${c.color}`}>
                  <Folder size={25} strokeWidth={1.4} />
                </span>
                <Button
                  variant="ghost"
                  onClick={() => start(c)}
                  aria-label={`Edit ${c.name}`}
                >
                  <Pencil size={14} />
                  Edit
                </Button>
              </div>
              <h2>
                <Link href={`/library?collection=${encodeURIComponent(c.id)}`}>
                  {c.name}
                </Link>
              </h2>
              {c.description && <p>{c.description}</p>}
              <div className="collection-rule">
                <span>Matches any of these tags</span>
                <div className="collection-tag-list">
                  {collectionTags(c).map((tag) => (
                    <Pill key={tag}>{tag}</Pill>
                  ))}
                </div>
              </div>
              <div className="collection-docs">
                {docs.slice(0, 3).map((d) => (
                  <span key={d.id}>
                    <FileText size={13} />
                    {d.name}
                  </span>
                ))}
                {!docs.length && (
                  <p className="subtle-note">
                    No matching filed documents yet. Add one of these tags to a
                    document to include it here.
                  </p>
                )}
              </div>
              <div className="collection-bottom">
                <span>
                  {docs.length} {docs.length === 1 ? "document" : "documents"}
                </span>
                <Link
                  className="text-link"
                  href={`/library?collection=${encodeURIComponent(c.id)}`}
                >
                  View documents <ArrowUpRight size={14} />
                </Link>
              </div>
            </section>
          )
        })}
        <button className="new-collection" onClick={() => start()}>
          <Plus size={23} />
          <strong>A new collection</strong>
          <span>Choose tags to group your documents.</span>
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => {
          if (!saving) setOpen(false)
        }}
        title={editing ? "Edit collection" : "Create a collection"}
        description="Filed documents with at least one selected tag appear automatically. Changing these tags does not change the tags on your documents."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (saving) return
            if (
              !selectedTags.length ||
              selectedTags.length > 20 ||
              selectedTags.some((tag) => tag.length > 80)
            ) {
              setError(
                "Choose between 1 and 20 tags, with at most 80 characters each."
              )
              return
            }
            setSaving(true)
            try {
              if (
                await run(
                  () =>
                    service.saveCollection({
                      id: editing?.id ?? service.createId(),
                      name,
                      tags: selectedTags,
                      description,
                      color: editing?.color ?? "blue",
                    }),
                  editing ? "Collection updated" : "Collection created"
                )
              )
                setOpen(false)
            } finally {
              setSaving(false)
            }
          }}
        >
          <fieldset disabled={saving} className="collection-fields">
            <label className="field">
              Name
              <input
                required
                maxLength={150}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="For example: My next trip"
              />
            </label>
            <label className="field">
              Description
              <input
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A few words to describe it"
              />
            </label>
            <label className="field" htmlFor="collection-tag-input">
              Associated tags
            </label>
            <p id="collection-tag-help" className="subtle-note">
              Choose existing tags below, or type a tag and press Enter. A
              document only needs one matching tag.
            </p>
            <div className="collection-tag-list" aria-label="Selected tags">
              {tags.map((tag) => (
                <span className="collection-tag" key={tag}>
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => {
                      setTags(tags.filter((t) => t !== tag))
                      setError("")
                    }}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
            <div className="collection-tag-input">
              <input
                id="collection-tag-input"
                aria-describedby="collection-tag-help"
                maxLength={80}
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value)
                  setError("")
                }}
                list="collection-tags"
                placeholder="Type a tag…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addTag(tagInput)
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!tagInput.trim()}
                onClick={() => addTag(tagInput)}
              >
                Add tag
              </Button>
            </div>
            <datalist id="collection-tags">
              {suggestions.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
            {suggestions.length > 0 && (
              <div className="collection-rule">
                <span>Tags on your documents</span>
                <div className="collection-tag-list">
                  {suggestions.map((tag) => (
                    <button
                      className="collection-tag"
                      type="button"
                      key={tag}
                      onClick={() => addTag(tag)}
                    >
                      <Plus size={12} />
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="subtle-note" aria-live="polite">
              {previewCount} filed{" "}
              {previewCount === 1 ? "document matches" : "documents match"}{" "}
              these tags. New matching documents will appear here once filed.
            </p>
            {error && <p role="alert">{error}</p>}
            <div className="modal-footer">
              <Button
                variant="outline"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedTags.length || !name.trim()}
              >
                {saving
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Create collection"}
              </Button>
            </div>
          </fieldset>
        </form>
      </Modal>
    </>
  )
}
export function Connectors() {
  const { state, service, run } = useWorkspace()
  const [selected, setSelected] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const connector = state.connectors.find((c) => c.id === selected)
  async function sync(id: string) {
    setSyncing(id)
    await run(() => service.syncConnector(id), "Connection checked")
    setSyncing(null)
  }
  return (
    <>
      <PageHeading
        title="Your documents, without borders"
        description="Connect your storage. Find everything in one library."
        actions={
          <Pill tone="green">
            {state.connectors.filter((c) => c.connected).length} connected
            storage locations
          </Pill>
        }
      />
      <div className="connectors-grid">
        {state.connectors.map((c) => (
          <section className="connector-card" key={c.id}>
            <div className="connector-top">
              <span className="connector-logo">
                <StorageIcon name={c.name} />
              </span>
              <Pill tone={c.connected ? "green" : "neutral"}>
                {c.connected && <span className="status-dot" />}
                {c.connected ? "Connected" : "Not connected"}
              </Pill>
            </div>
            <h2>{c.name}</h2>
            <p>{c.description}</p>
            <div className="connector-actions">
              {c.connected ? (
                <>
                  <Button variant="ghost" onClick={() => setSelected(c.id)}>
                    Manage
                    <ArrowUpRight size={13} />
                  </Button>
                  <Button
                    variant="outline"
                    disabled={syncing !== null}
                    onClick={() => void sync(c.id)}
                  >
                    <RefreshCw
                      size={14}
                      className={syncing === c.id ? "spin" : ""}
                    />
                    {syncing === c.id ? "Checking…" : "Test"}
                  </Button>
                </>
              ) : (
                <Button onClick={() => setSelected(c.id)}>
                  <Plus size={14} />
                  Connect
                </Button>
              )}
            </div>
          </section>
        ))}
      </div>
      {connector && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={
            connector.connected
              ? `Manage ${connector.name}`
              : `Connect ${connector.name}`
          }
          description="Configure your storage."
        >
          <div className="connection-preview">
            <StorageIcon name={connector.name} />
            <strong>{connector.account}</strong>
            <span>{connector.folder}</span>
            {connector.lastSync && (
              <small>Last sync: {dateLabel(connector.lastSync)}</small>
            )}
          </div>
          <p className="subtle-note">
            {connector.connected
              ? "Files remain on Drive after disconnecting, but are unavailable in Open File until you reconnect the same account."
              : "You will be redirected to Google to allow Open File to manage files created by the app."}
          </p>
          <div className="modal-footer">
            <Button variant="outline" onClick={() => setSelected(null)}>
              Close
            </Button>
            <Button
              disabled={connector.id === "local"}
              onClick={async () => {
                if (
                  await run(
                    () => service.toggleConnector(connector.id),
                    connector.connected
                      ? "Storage disconnected"
                      : "Google authorization opened"
                  )
                )
                  setSelected(null)
              }}
            >
              {connector.connected ? "Disconnect" : "Continue with Google"}
              <Cable size={14} />
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
