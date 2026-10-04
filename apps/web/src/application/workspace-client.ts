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
export interface WorkspaceClient {
  load(): Promise<Workspace>
  createId(): string
  saveDocument(document: Document, approve?: boolean): Promise<Workspace>
  approveDocuments(ids: string[]): Promise<Workspace>
  deleteDocument(id: string): Promise<Workspace>
  archiveDocument(id: string): Promise<Workspace>
  toggleFavorite(id: string): Promise<Workspace>
  retryDocument(id: string): Promise<Workspace>
  importFiles(files: File[], storage: Storage): Promise<ImportResult>
  toggleConnector(id: string): Promise<Workspace>
  syncConnector(id: string): Promise<Workspace>
  saveCollection(collection: Collection): Promise<Workspace>
  saveSettings(settings: Settings): Promise<Workspace>
  answer(question: string, ids?: string[]): Promise<Answer>
  integrations(): Promise<IntegrationSettings>
  saveIntegrations(input: {
    ai?: Omit<IntegrationSettings["ai"], "hasApiKey"> & {
      apiKey?: string
      removeKey?: boolean
    }
    localFolder?: string
    driveFolder?: string
  }): Promise<IntegrationSettings>
}
