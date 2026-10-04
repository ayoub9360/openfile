export type DocumentStatus = "pending" | "filed" | "archived"
export type DocumentKind =
  "Invoice" | "Contract" | "Certificate" | "Statement" | "Document"
export type Storage = "Google Drive" | "OneDrive" | "Local"
export interface Document {
  id: string
  name: string
  originalName: string
  /** Creation in the library (import timestamp), independent of the document date. */
  createdAt?: string
  kind: DocumentKind
  issuer: string
  date: string
  amount?: number
  storage: Storage
  folder: string
  tags: string[]
  status: DocumentStatus
  confidence: number
  favorite: boolean
  size: string
  content: string
  summary: string
  imported?: boolean
  mimeType?: string
  processing?: "queued" | "processing" | "ready" | "failed"
  classification?: { name: string; folder: string }
  analysisMode?: "ai" | "manual"
  processingWarning?: string
  processingError?: string
  revision?: number
}
export interface Connector {
  id: string
  name: string
  description: string
  connected: boolean
  account: string
  folder: string
  lastSync: string
}
export interface Collection {
  id: string
  name: string
  description: string
  /** Legacy collections stored a single tag. */
  tag?: string
  tags?: string[]
  color: string
}
export function collectionTags(collection: Collection): string[] {
  return [
    ...new Set(
      (collection.tags ?? (collection.tag ? [collection.tag] : []))
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
  ]
}
export function matchesCollection(document: Document, collection: Collection) {
  return collectionTags(collection).some((tag) => document.tags.includes(tag))
}
export interface Activity {
  id: string
  title: string
  detail: string
  date: string
  documentId?: string
  undo?: Document[]
}
export interface Settings {
  name: string
  email: string
  naming: string
  review: boolean
  notifications: boolean
}
export interface Workspace {
  version: 1
  documents: Document[]
  connectors: Connector[]
  collections: Collection[]
  activities: Activity[]
  settings: Settings
}
export interface ImportResult {
  state: Workspace
  documentIds: string[]
  errors: string[]
}
export interface Answer {
  notice?: string
  text: string
  sources: { id: string; name: string; excerpt: string }[]
}
export const kinds: DocumentKind[] = [
  "Invoice",
  "Contract",
  "Certificate",
  "Statement",
  "Document",
]
export const storages: Storage[] = ["Google Drive", "Local"]
export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}
export function matchesDocument(document: Document, query: string) {
  const text = normalize(
    [
      document.name,
      document.issuer,
      document.kind,
      document.folder,
      document.content,
      ...document.tags,
    ].join(" ")
  )
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => text.includes(term))
}
export function validateDocument(document: Document) {
  if (!document.name.trim() || !document.folder.trim())
    throw new Error("Name and folder are required.")
  if (/[\\/]/.test(document.name))
    throw new Error("File names must not contain slashes.")
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(document.date) ||
    Number.isNaN(Date.parse(document.date))
  )
    throw new Error("Choose a valid date.")
}

export interface AISettings {
  provider: "openai"
  model: string
  embeddingModel: string
  hasApiKey: boolean
  enabled: boolean
}
export interface ConnectionSettings {
  localFolder: string
  driveFolder: string
  googleConfigured: boolean
  driveConnected: boolean
}
export interface IntegrationSettings {
  ai: AISettings
  connectors: ConnectionSettings
}

export { englishWorkspace, englishNamingTemplate } from "./legacy-english"
