"use client"
import { AppSelect } from "./app-select"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Upload,
  FileText,
  X,
  Sparkles,
  LoaderCircle,
  Check,
  Folder,
  FolderPlus,
  AlertCircle,
} from "lucide-react"
import { Button } from "@open-file/ui/components/button"
import type {
  Document,
  IntegrationSettings,
  Storage,
} from "../../domain/workspace"
import { useWorkspace } from "../workspace-context"
import { Modal, Pill } from "./primitives"
export function ImportDialog() {
  const { importing, importId } = useWorkspace()
  return importing ? (
    <ImportFlow key={importId ?? "new"} resumeId={importId} />
  ) : null
}
function ImportFlow({ resumeId }: { resumeId: string | null }) {
  const { closeImport, service, accept, notify, state } = useWorkspace()
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [storage, setStorage] = useState<"Local" | "Google Drive">("Local")
  const [ids, setIds] = useState<string[]>(
    resumeId
      ? [
          resumeId,
          ...state.documents
            .filter(
              (d) =>
                (d.status === "pending" || d.classification) &&
                d.id !== resumeId
            )
            .map((d) => d.id),
        ]
      : []
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [manual, setManual] = useState(false)
  const [integrations, setIntegrations] = useState<IntegrationSettings | null>(
    null
  )
  const input = useRef<HTMLInputElement>(null)
  const current = ids
    .map((id) => state.documents.find((d) => d.id === id))
    .find((d) => d && (d.status === "pending" || d.classification))
  const processing =
    current?.processing === "queued" || current?.processing === "processing"
  useEffect(() => {
    let live = true
    service
      .integrations()
      .then((s) => {
        if (live) setIntegrations(s)
      })
      .catch(() => {
        if (live)
          setError("Unable to check AI settings. Try again in a moment.")
      })
    return () => {
      live = false
    }
  }, [service])
  function settings() {
    closeImport()
    router.push("/settings")
  }
  function add(selected: FileList | null) {
    if (!selected) return
    const valid = [...selected].filter(
      (f) =>
        /\.(pdf|png|jpe?g|webp|txt)$/i.test(f.name) &&
        f.size <= 20 * 1024 * 1024
    )
    if (valid.length !== selected.length || valid.length + files.length > 5)
      setError(
        "Choose up to 5 PDFs, images, or TXT files, no larger than 20 MB each."
      )
    else setError("")
    setFiles((previous) => [...previous, ...valid].slice(0, 5))
  }
  async function upload() {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const result = await service.importFiles(files, storage)
      accept(result.state)
      setIds(result.documentIds)
      setError(result.errors.join(" · "))
      if (result.documentIds.length) setFiles([])
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Import failed. Please try again."
      )
    } finally {
      setBusy(false)
    }
  }
  async function retry() {
    if (!current) return
    setBusy(true)
    setError("")
    setManual(false)
    try {
      accept(await service.retryDocument(current.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to restart analysis.")
    } finally {
      setBusy(false)
    }
  }
  async function submit(draft: Document) {
    setBusy(true)
    setError("")
    try {
      const next = await service.saveDocument(draft, true)
      accept(next)
      setManual(false)
      if (
        !ids.some((id) =>
          next.documents.some(
            (d) => d.id === id && (d.status === "pending" || d.classification)
          )
        )
      ) {
        closeImport()
        notify("Document(s) filed")
        router.push(
          `/library?storage=${encodeURIComponent(draft.storage)}&folder=${encodeURIComponent(draft.folder)}`
        )
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Filing failed. Your file has been kept."
      )
    } finally {
      setBusy(false)
    }
  }
  const ready =
    current && !processing && (current.processing !== "failed" || manual)
  return (
    <Modal
      open
      onClose={closeImport}
      blocking={busy || ids.length > 0}
      title={
        busy && !current
          ? "Uploading document…"
          : processing
            ? "Your document is being analyzed"
            : ready
              ? "Ready to file"
              : current
                ? "Analysis failed"
                : "Import a document"
      }
      description={
        current
          ? current.originalName
          : "Upload, review the suggestion, then approve the filing."
      }
    >
      <ol className="import-steps" aria-label="Import steps">
        <li className={!current ? "active" : "done"}>1. Import</li>
        <li className={processing ? "active" : ready ? "done" : ""}>
          2. Analysis
        </li>
        <li className={ready ? "active" : ""}>3. Approval</li>
      </ol>
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
      {!current && !busy && (
        <>
          <input
            ref={input}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
            className="sr-only"
            aria-label="Choose files"
            onChange={(e) => {
              add(e.target.files)
              e.target.value = ""
            }}
          />
          <button
            className="upload-zone"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              add(e.dataTransfer.files)
            }}
          >
            <span className="upload-symbol">
              <Upload size={24} />
            </span>
            <strong>Drag your files here</strong>
            <span>or choose them from your device</span>
            <small>PDF, images, TXT · 5 files · 20 MB each</small>
          </button>
          <div className="import-files">
            {files.map((file, i) => (
              <div key={`${file.name}-${i}`}>
                <FileText size={17} />
                <span className="truncate">{file.name}</span>
                <button
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setFiles(files.filter((_, index) => index !== i))
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          <label className="field">
            Storage location
            <AppSelect
              value={storage}
              onValueChange={(value) => setStorage(value as typeof storage)}
              options={[
                { value: "Local", label: "Local" },
                {
                  value: "Google Drive",
                  label: "Google Drive",
                  disabled: !state.connectors.find((c) => c.id === "drive")
                    ?.connected,
                },
              ]}
            />
          </label>
          {integrations &&
          (!integrations.ai.enabled || !integrations.ai.hasApiKey) ? (
            <div className="import-notice">
              <AlertCircle size={18} />
              <div>
                <strong>Automatic analysis is not enabled</strong>
                <p>
                  Enable OpenAI to suggest a name and folder. You can also file
                  this document manually.
                </p>
                <button className="text-link" onClick={settings}>
                  Configure AI
                </button>
              </div>
            </div>
          ) : (
            <p className="subtle-note">
              Analysis will suggest a name and folder. The file will be filed
              after your approval.
            </p>
          )}
          <div className="modal-footer">
            <Button variant="ghost" onClick={closeImport}>
              Cancel
            </Button>
            <Button disabled={!files.length || !integrations} onClick={upload}>
              <Sparkles size={15} />
              {integrations?.ai.enabled && integrations.ai.hasApiKey
                ? "Import and analyze"
                : "Import without AI"}
            </Button>
          </div>
        </>
      )}
      {(processing || (busy && !current)) && (
        <div className="import-progress" role="status">
          <LoaderCircle className="spin" size={36} />
          <h3>
            {busy && !current
              ? "Uploading…"
              : "Reading and preparing the filing…"}
          </h3>
          <p>
            {current?.processingError ??
              "Please wait. The suggestion will appear here automatically."}
          </p>
          <small>The file has not been filed in your library yet.</small>
        </div>
      )}
      {current?.processing === "failed" && !manual && (
        <div className="import-notice">
          <AlertCircle size={22} />
          <div>
            <p role="alert">
              {current.processingError || "Unable to analyze this file."}
            </p>
            <div className="inline-actions">
              <Button disabled={busy} variant="outline" onClick={retry}>
                Retry analysis
              </Button>
              <Button variant="outline" onClick={settings}>
                Open settings
              </Button>
              <Button variant="ghost" onClick={() => setManual(true)}>
                File manually
              </Button>
            </div>
          </div>
        </div>
      )}
      {ready && !manual && current.analysisMode !== "ai" && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={
            integrations?.ai.enabled && integrations.ai.hasApiKey
              ? retry
              : settings
          }
        >
          {integrations?.ai.enabled && integrations.ai.hasApiKey
            ? "Analyze with AI"
            : "Configure automatic analysis"}
        </Button>
      )}
      {current &&
        ids.filter((id) =>
          state.documents.some(
            (d) => d.id === id && (d.status === "pending" || d.classification)
          )
        ).length > 1 && (
          <button
            disabled={busy}
            className="text-link"
            onClick={() => {
              setIds((ids) => [
                ...ids.filter((id) => id !== current.id),
                current.id,
              ])
              setManual(false)
              setError("")
            }}
          >
            Skip to next file
          </button>
        )}
      {ready && (
        <ImportReview
          key={`${current.id}:${current.revision}`}
          document={current}
          manual={manual || current.analysisMode !== "ai"}
          busy={busy}
          submit={submit}
        />
      )}
      {current && (
        <div className="import-later">
          <span>
            {ids.length > 1
              ? `${ids.filter((id) => state.documents.some((d) => d.id === id && d.status === "filed")).length + 1} / ${ids.length} files`
              : "Your file is kept until approval."}
          </span>
          <button disabled={busy} className="text-link" onClick={closeImport}>
            Resume later
          </button>
        </div>
      )}
    </Modal>
  )
}
function ImportReview({
  document,
  manual,
  busy,
  submit,
}: {
  document: Document
  manual: boolean
  busy: boolean
  submit: (draft: Document) => Promise<void>
}) {
  const { state } = useWorkspace()
  const [draft, setDraft] = useState({
    ...document,
    ...document.classification,
  })
  // Include ancestor folders and archived files: both still exist in storage.
  // Pending proposals must never be presented as already-created folders.
  const folders = [
    ...new Set(
      state.documents
        .filter((d) => d.status !== "pending" && d.storage === draft.storage)
        .flatMap((d) => {
          const parts = d.folder.split("/").map((part) => part.trim())
          return parts.map((_, i) => parts.slice(0, i + 1).join("/"))
        })
    ),
  ].sort((a, b) => a.localeCompare(b, "en"))
  const destination = draft.folder.split("/").map((part) => part.trim())
  const validDestination = destination.every(Boolean)
  const newFolders = validDestination
    ? destination
        .map((_, i) => destination.slice(0, i + 1).join("/"))
        .filter((folder) => !folders.includes(folder))
    : []
  const createsFolder = validDestination && newFolders.length > 0
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit(draft)
      }}
    >
      <div className="import-review-summary">
        <Pill tone={manual ? "amber" : "green"}>
          {manual ? "Manual filing" : "AI suggestion"}
        </Pill>
        <p>
          {manual
            ? "Choose the name and folder you want. No AI suggestion was generated."
            : document.summary}
        </p>
      </div>
      {document.processingWarning && (
        <p className="import-notice">{document.processingWarning}</p>
      )}
      <label className="field">
        File name
        <input
          required
          maxLength={180}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label className="field">
        Storage location
        <AppSelect
          value={draft.storage}
          onValueChange={(value) =>
            setDraft({ ...draft, storage: value as Storage })
          }
          options={[
            { value: "Local", label: "Local" },
            {
              value: "Google Drive",
              label: "Google Drive",
              disabled: !state.connectors.find((c) => c.id === "drive")
                ?.connected,
            },
          ]}
        />
      </label>
      <label className="field">
        Destination folder
        <input
          required
          list="import-folders"
          value={draft.folder}
          onChange={(e) => setDraft({ ...draft, folder: e.target.value })}
          placeholder="Documents/Work"
        />
        <datalist id="import-folders">
          {folders.map((folder) => (
            <option key={folder} value={folder} />
          ))}
        </datalist>
      </label>
      {validDestination && (
        <div
          className="import-notice folder-proposal"
          role="status"
          aria-live="polite"
        >
          {createsFolder ? <FolderPlus size={22} /> : <Folder size={22} />}
          <div>
            <strong>
              {createsFolder ? "New folder suggested" : "Existing folder"}
            </strong>
            <p>
              {createsFolder
                ? "This destination is not in your library yet. Missing folders will only be created when you approve."
                : "The file will be filed in this folder after your approval."}
            </p>
            <ol
              className="folder-proposal-tree"
              aria-label="Destination folder tree"
            >
              {destination.map((part, i) => {
                const path = destination.slice(0, i + 1).join("/")
                const isNew = newFolders.includes(path)
                return (
                  <li key={path} style={{ paddingInlineStart: i * 16 }}>
                    <span aria-hidden="true">{i > 0 ? "↳" : ""}</span>
                    {isNew ? <FolderPlus size={16} /> : <Folder size={16} />}
                    <span>{part}</span>
                    {isNew && <Pill tone="green">To be created</Pill>}
                  </li>
                )
              })}
            </ol>
            {createsFolder && (
              <small>Created upon approval. You can edit the path above.</small>
            )}
          </div>
        </div>
      )}
      {folders.length > 0 && (
        <label className="field">
          Or choose an existing folder
          <AppSelect
            value=""
            onValueChange={(value) => {
              if (value) setDraft({ ...draft, folder: value })
            }}
            options={[
              { value: "", label: "Select a folder…" },
              ...folders.map((value) => ({ value, label: value })),
            ]}
          />
        </label>
      )}
      <details className="import-details">
        <summary>Other information</summary>
        <label className="field">
          Issuer
          <input
            value={draft.issuer}
            onChange={(e) => setDraft({ ...draft, issuer: e.target.value })}
          />
        </label>
        <label className="field">
          Date
          <input
            required
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </label>
        <label className="field">
          Tags
          <input
            value={draft.tags.join(", ")}
            onChange={(e) =>
              setDraft({
                ...draft,
                tags: e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <a
          className="text-link"
          href={`/api/documents/${document.id}/file`}
          target="_blank"
          rel="noreferrer"
        >
          View original file
        </a>
      </details>
      <div className="modal-footer">
        <Button type="submit" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Check size={15} />
          )}
          {busy ? "Filing…" : "Approve and file"}
        </Button>
      </div>
    </form>
  )
}
