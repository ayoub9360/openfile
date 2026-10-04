"use client"
import { AppSelect } from "../components/app-select"
import { useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  Search,
  List,
  LayoutGrid,
  Folder,
  ChevronRight,
  Star,
  Upload,
  ArrowUpDown,
} from "lucide-react"
import { Button } from "@open-file/ui/components/button"
import {
  kinds,
  storages,
  matchesDocument,
  matchesCollection,
  collectionTags,
} from "../../domain/workspace"
import { childFolders } from "../../application/library"
import { useWorkspace } from "../workspace-context"
import {
  PageHeading,
  StorageIcon,
  FileIcon,
  EmptyState,
  dateLabel,
} from "../components/primitives"
import { DocumentDetail } from "../components/document-detail"
import { DocumentActions } from "../components/document-actions"
import { DocumentCard } from "../components/document-card"
export function Documents() {
  const { state, openImport } = useWorkspace()
  const params = useSearchParams()
  const router = useRouter()
  const folder = params.get("folder") ?? ""
  const storage = params.get("storage") ?? ""
  const tag = params.get("tag") ?? ""
  const collectionId = params.get("collection")
  const collection = state.collections.find((c) => c.id === collectionId)
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("")
  const [tab, setTab] = useState("folders")
  const [view, setView] = useState("list")
  const [sort, setSort] = useState("name")
  const [detail, setDetail] = useState<string | null>(null)
  const pending = state.documents.filter(
    (d) => d.status === "pending" || d.classification
  )
  const browse =
    tab === "folders" && !query.trim() && !kind && !tag && !collectionId
  const candidates = state.documents.filter(
    (d) =>
      (tab === "archive" ? d.status === "archived" : d.status === "filed") &&
      (!storage || d.storage === storage) &&
      (!tag || d.tags.includes(tag)) &&
      (!collectionId || (collection && matchesCollection(d, collection))) &&
      (tab !== "favorites" || d.favorite) &&
      matchesDocument(d, query) &&
      (!kind || d.kind === kind)
  )
  const folders = browse ? childFolders(candidates, folder) : []
  const creationDate = (document: (typeof candidates)[number]) =>
    document.createdAt ??
    state.activities.find(
      (activity) =>
        activity.documentId === document.id &&
        activity.title === "Document imported"
    )?.date
  const docs = candidates
    .filter((d) =>
      browse
        ? d.folder === folder
        : !folder || d.folder === folder || d.folder.startsWith(folder + "/")
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "en")
        : (creationDate(b) ?? "").localeCompare(creationDate(a) ?? "")
    )
  const selected = state.documents.find((d) => d.id === detail)
  function navigate(path: string, space = storage) {
    const q = new URLSearchParams()
    if (path) q.set("folder", path)
    if (space) q.set("storage", space)
    router.push(`/library${q.size ? `?${q}` : ""}`)
  }
  return (
    <>
      <PageHeading
        title={collection?.name || tag || "Library"}
        description={
          collection
            ? `Documents with at least one of these tags: ${collectionTags(collection).join(", ")}. Manage these tags on the Collections page.`
            : "Your files and folders, made simple."
        }
        actions={
          <Button onClick={() => openImport()}>
            <Upload size={15} />
            Import
          </Button>
        }
      />
      {pending.length > 0 && (
        <div className="unfinished-import">
          <div>
            <strong>
              {pending.length === 1
                ? "One filing to approve"
                : `${pending.length} filings to approve`}
            </strong>
            <p>Review the suggestion and confirm the destination folder.</p>
          </div>
          <Button variant="outline" onClick={() => openImport(pending[0]!.id)}>
            Resume import
          </Button>
        </div>
      )}
      <div className="tab-bar">
        <div role="tablist" aria-label="Document view">
          {[
            ["folders", "Folders"],
            ["all", "All files"],
            ["favorites", "Favorites"],
            ["archive", "Archives"],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key!)
                if (folder) navigate("")
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="document-toolbar">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search documents"
            placeholder="Search files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filters">
          <AppSelect
            aria-label="Filter by type"
            value={kind}
            onValueChange={(value) => setKind(value)}
            options={[
              { value: "", label: "All types" },
              ...kinds.map((value) => ({ value, label: value })),
            ]}
          />
          <AppSelect
            aria-label="Filter by storage"
            value={storage}
            onValueChange={(value) => navigate("", value)}
            options={[
              { value: "", label: "All storage locations" },
              ...storages.map((value) => ({ value, label: value })),
            ]}
          />
          <button
            className="icon-button"
            aria-label={sort === "date" ? "Sort by name" : "Sort by date"}
            onClick={() => setSort(sort === "date" ? "name" : "date")}
          >
            <ArrowUpDown size={16} />
          </button>
          <div className="view-toggle">
            <button
              aria-label="List view"
              aria-pressed={view === "list"}
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              <List size={16} />
            </button>
            <button
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={view === "grid" ? "active" : ""}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>
      <nav className="folder-breadcrumb" aria-label="Current folder">
        <button onClick={() => navigate("")}>All folders</button>
        {folder
          .split("/")
          .filter(Boolean)
          .map((segment, i, parts) => (
            <span key={i}>
              <ChevronRight size={14} />
              <button onClick={() => navigate(parts.slice(0, i + 1).join("/"))}>
                {segment}
              </button>
            </span>
          ))}
      </nav>
      {folders.length > 0 && (
        <div className="library-folders">
          {folders.map((f) => (
            <button
              key={`${f.storage}:${f.path}`}
              className="library-folder"
              aria-label={`Open folder ${f.name} (${f.storage})`}
              onClick={() => navigate(f.path, f.storage)}
            >
              <span className="folder-tile">
                <Folder size={24} />
              </span>
              <span>
                <strong>{f.name}</strong>
                <small>
                  {f.storage} · {f.count} file{f.count > 1 ? "s" : ""}
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      )}
      {!folders.length && !docs.length ? (
        <EmptyState
          title={
            query || kind
              ? "No files found"
              : "This folder is ready for your files"
          }
          description="Import a document, review the suggestion, then approve its filing."
          action={
            <Button variant="outline" onClick={() => openImport()}>
              Import a document
            </Button>
          }
        />
      ) : (
        docs.length > 0 &&
        (view === "list" ? (
          <div className="table-wrap library-table">
            <table className="document-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col" title="Date created in your library">
                    Date created
                  </th>
                  <th scope="col">Size</th>
                  <th scope="col">File type</th>
                  <th scope="col" className="file-actions">
                    Actions
                  </th>
                  <th scope="col" className="file-location">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <button
                        className="table-document"
                        onClick={() => setDetail(d.id)}
                      >
                        <FileIcon kind={d.kind} />
                        <span>
                          <strong title={d.name}>{d.name}</strong>
                        </span>
                        {d.favorite && (
                          <Star
                            size={14}
                            className="is-favorite file-favorite"
                            fill="currentColor"
                            aria-label="Favorite"
                          />
                        )}
                      </button>
                    </td>
                    <td>
                      <span
                        className="muted no-wrap"
                        title="Date created in your library"
                      >
                        {creationDate(d) ? dateLabel(creationDate(d)!) : "—"}
                      </span>
                    </td>
                    <td className="muted no-wrap">{d.size}</td>
                    <td>
                      <span className="document-format">
                        {(
                          {
                            "application/pdf": "PDF",
                            "image/jpeg": "JPEG",
                            "image/png": "PNG",
                            "image/webp": "WebP",
                            "text/plain": "TXT",
                          } as Record<string, string>
                        )[d.mimeType ?? ""] ??
                          d.name.match(/\.([^.]+)$/)?.[1]?.toUpperCase() ??
                          "—"}
                      </span>
                    </td>
                    <td className="file-actions">
                      <DocumentActions document={d} />
                    </td>
                    <td className="file-location">
                      <span className="file-storage">
                        <span aria-hidden="true">
                          <StorageIcon name={d.storage} />
                        </span>
                        <strong>{d.storage}</strong>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="document-cards">
            {docs.map((d) => (
              <DocumentCard
                key={`${d.id}:${d.revision}`}
                document={d}
                onOpen={() => setDetail(d.id)}
              />
            ))}
          </div>
        ))
      )}
      <div className="table-summary">
        <span>
          {folders.length > 0 ? `${folders.length} folder(s) · ` : ""}
          {docs.length} file(s)
        </span>
        <span>{sort === "date" ? "Newest first" : "Alphabetical order"}</span>
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
