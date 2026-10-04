import type {
  Collection,
  Document,
  Settings,
  Workspace,
} from "../domain/workspace"
import { validateDocument, collectionTags } from "../domain/workspace"
import type {
  DocumentIntelligence,
  Runtime,
  WorkspaceRepository,
} from "./ports"

export class WorkspaceService {
  constructor(
    private repository: WorkspaceRepository,
    private intelligence: DocumentIntelligence,
    private runtime: Runtime
  ) {}
  load() {
    return this.repository.load()
  }
  createId() {
    return this.runtime.id()
  }
  private update(
    title: string,
    detail: string,
    change: (state: Workspace) => void,
    undo?: Document[],
    documentId?: string
  ) {
    const state = this.load()
    change(state)
    state.activities.unshift({
      id: this.runtime.id(),
      title,
      detail,
      date: this.runtime.now(),
      undo,
      documentId,
    })
    this.repository.save(state)
    return state
  }
  saveDocument(document: Document, approve = false) {
    validateDocument(document)
    const previous = this.load().documents.find(
      (item) => item.id === document.id
    )
    if (!previous) throw new Error("Document not found.")
    return this.update(
      approve ? "Document filed" : "Document modified",
      document.name,
      (state) => {
        state.documents = state.documents.map((item) =>
          item.id === document.id
            ? { ...document, status: approve ? "filed" : document.status }
            : item
        )
      },
      [previous],
      document.id
    )
  }
  approveDocuments(ids: string[]) {
    const previous = this.load().documents.filter(
      (d) => ids.includes(d.id) && d.status === "pending"
    )
    previous.forEach(validateDocument)
    if (!previous.length) throw new Error("Select a document to approve.")
    return this.update(
      "Documents filed",
      `${previous.length} document(s) approved`,
      (state) => {
        state.documents = state.documents.map((d) =>
          previous.some((p) => p.id === d.id) ? { ...d, status: "filed" } : d
        )
      },
      previous
    )
  }
  archiveDocument(id: string) {
    const previous = this.load().documents.find((d) => d.id === id)
    if (!previous) throw new Error("Document not found.")
    return this.update(
      "Document archived",
      previous.name,
      (state) => {
        state.documents = state.documents.map((d) =>
          d.id === id ? { ...d, status: "archived" } : d
        )
      },
      [previous],
      id
    )
  }
  toggleFavorite(id: string) {
    const state = this.load()
    state.documents = state.documents.map((d) =>
      d.id === id ? { ...d, favorite: !d.favorite } : d
    )
    this.repository.save(state)
    return state
  }
  importFiles(files: { name: string; size: number }[]) {
    if (!files.length) throw new Error("Choose at least one file.")
    const documents = files.map((file) =>
      this.intelligence.analyze(file.name, file.size)
    )
    return this.update(
      "Import complete",
      `${documents.length} document(s) to review`,
      (state) => {
        state.documents.unshift(...documents)
      }
    )
  }
  toggleConnector(id: string) {
    return this.update(
      "Connection updated",
      "Demo connection updated",
      (state) => {
        state.connectors = state.connectors.map((c) =>
          c.id === id
            ? { ...c, connected: !c.connected, lastSync: this.runtime.now() }
            : c
        )
      }
    )
  }
  syncConnector(id: string) {
    const connector = this.load().connectors.find((c) => c.id === id)
    if (!connector?.connected) throw new Error("Connect this storage first.")
    return this.update(
      "Sync complete",
      `${connector.name} · no new documents in the demo`,
      (state) => {
        state.connectors = state.connectors.map((c) =>
          c.id === id ? { ...c, lastSync: this.runtime.now() } : c
        )
      }
    )
  }
  saveCollection(collection: Collection) {
    const tags = collectionTags(collection)
    if (
      !collection.name.trim() ||
      collection.name.trim().length > 150 ||
      !tags.length ||
      tags.length > 20 ||
      tags.some((tag) => tag.length > 80) ||
      collection.description.length > 1000
    )
      throw new Error(
        "Provide a name and between 1 and 20 tags (80 characters each)."
      )
    const exists = this.load().collections.some((c) => c.id === collection.id)
    return this.update(
      exists ? "Collection updated" : "Collection created",
      collection.name,
      (state) => {
        const { tag: _legacyTag, ...value } = collection
        const saved = { ...value, name: value.name.trim(), tags }
        const index = state.collections.findIndex((c) => c.id === collection.id)
        if (index === -1) state.collections.push(saved)
        else state.collections[index] = saved
      }
    )
  }

  saveSettings(settings: Settings) {
    if (!settings.name.trim() || !settings.email.includes("@"))
      throw new Error("Check your name and email address.")
    return this.update(
      "Preferences saved",
      "Your workspace settings",
      (state) => {
        state.settings = settings
      }
    )
  }
  undoActivity(id: string) {
    const state = this.load()
    const activity = state.activities.find((a) => a.id === id)
    if (!activity?.undo) throw new Error("This action can no longer be undone.")
    const restore = activity.undo
    state.documents = state.documents.map(
      (d) => restore.find((r) => r.id === d.id) ?? d
    )
    // Invalidate older snapshots touching the same files to avoid replaying stale edits.
    state.activities = state.activities.map((a) =>
      a.undo?.some((d) => restore.some((r) => r.id === d.id))
        ? { ...a, undo: undefined }
        : a
    )
    state.activities.unshift({
      id: this.runtime.id(),
      title: "Action undone",
      detail: activity.detail,
      date: this.runtime.now(),
    })
    this.repository.save(state)
    return state
  }
  answer(question: string, ids?: string[]) {
    return this.intelligence.answer(
      question,
      this.load().documents.filter(
        (d) => d.status !== "archived" && (!ids || ids.includes(d.id))
      )
    )
  }
  reset() {
    return this.repository.reset()
  }
}
