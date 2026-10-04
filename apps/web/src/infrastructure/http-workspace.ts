import type { WorkspaceClient } from "../application/workspace-client"
import type {
  Answer,
  Collection,
  Document,
  IntegrationSettings,
  Settings,
  Storage,
  Workspace,
  ImportResult,
} from "../domain/workspace"
import { createBrowserRuntime } from "./browser-runtime"
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(body instanceof FormData
      ? { body }
      : body !== undefined
        ? {
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
          }
        : {}),
    signal: AbortSignal.timeout(120000),
  })
  const result = await response.json()
  if (!response.ok)
    throw new Error(result.error ?? "The server is unavailable.")
  return result as T
}
export class HttpWorkspace implements WorkspaceClient {
  load() {
    return request<Workspace>("/workspace")
  }
  createId() {
    return createBrowserRuntime().id()
  }
  saveDocument(document: Document, approve = false) {
    const {
      name,
      kind,
      issuer,
      date,
      amount,
      storage,
      folder,
      tags,
      revision,
    } = document
    return request<Workspace>(`/documents/${document.id}`, "PUT", {
      document: {
        name,
        kind,
        issuer,
        date,
        amount,
        storage,
        folder,
        tags,
        revision,
      },
      approve,
    })
  }
  approveDocuments(ids: string[]) {
    return request<Workspace>("/documents/approve", "POST", { ids })
  }
  deleteDocument(id: string) {
    return request<Workspace>(`/documents/${encodeURIComponent(id)}`, "DELETE")
  }
  archiveDocument(id: string) {
    return request<Workspace>(`/documents/${id}/archive`, "POST")
  }
  toggleFavorite(id: string) {
    return request<Workspace>(`/documents/${id}/favorite`, "POST")
  }
  retryDocument(id: string) {
    return request<Workspace>(`/documents/${id}/retry`, "POST")
  }
  async importFiles(files: File[], storage: Storage) {
    const body = new FormData()
    body.append("storage", storage)
    for (const file of files) body.append("files", file)
    return request<ImportResult>("/documents", "POST", body)
  }

  async toggleConnector(id: string) {
    if (id === "local")
      throw new Error(
        "Local storage is always available. Configure its folder in settings."
      )
    const current = await this.integrations()
    if (current.connectors.driveConnected)
      return request<Workspace>("/connectors/drive/disconnect", "POST")
    const result = await request<{ url: string }>(
      "/connectors/drive/authorize",
      "POST"
    )
    window.location.assign(result.url)
    return this.load()
  }
  syncConnector(id: string) {
    return request<Workspace>(`/connectors/${id}/test`, "POST")
  }
  saveCollection(collection: Collection) {
    return request<Workspace>("/collections", "POST", collection)
  }
  saveSettings(settings: Settings) {
    return request<Workspace>("/settings", "PUT", settings)
  }
  answer(question: string, ids?: string[]) {
    return request<Answer>("/search/answer", "POST", { question, ids })
  }
  integrations() {
    return request<IntegrationSettings>("/integrations")
  }
  saveIntegrations(input: Parameters<WorkspaceClient["saveIntegrations"]>[0]) {
    return request<IntegrationSettings>("/integrations", "PUT", input)
  }
}
