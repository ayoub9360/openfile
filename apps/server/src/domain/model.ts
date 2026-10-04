import type {
  AISettings,
  Document,
  Storage,
  Workspace,
} from "@open-file/core/workspace"
export type User = { id: string; name: string; email: string }
export interface FileRef {
  storage: "Local" | "Google Drive"
  key: string
  mimeType: string
  bytes: number
}
export interface Secrets {
  aiKey?: string
  ai: Omit<AISettings, "hasApiKey">
  localFolder: string
  driveFolder: string
  driveRootId?: string
  driveRefreshToken?: string
}
export interface Chunk {
  id: string
  documentId: string
  text: string
  embedding?: number[]
  model?: string
}
export interface Source {
  id: string
  name: string
  excerpt: string
}
export interface Analysis {
  text: string
  metadata: Pick<
    Document,
    | "name"
    | "kind"
    | "issuer"
    | "date"
    | "folder"
    | "tags"
    | "summary"
    | "confidence"
  >
  amount?: number
}
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryable = false
  ) {
    super(message)
  }
}
export function destination(value: Storage): "Local" | "Google Drive" {
  if (value !== "Local" && value !== "Google Drive")
    throw new AppError(400, "Unsupported destination.")
  return value
}
// Reject control characters in filesystem names.
export function safeSegment(value: string) {
  value = value.trim()
  if (
    !value.trim() ||
    value === "." ||
    value === ".." ||
    /[\\/<>:"|?*]/.test(value) ||
    [...value].some((character) => character.charCodeAt(0) < 32) ||
    value.length > 180
  )
    throw new AppError(400, "Invalid file or folder name.")
  return value.trim()
}
export function safeFolder(value: string) {
  const parts = value.split("/").map((s) => safeSegment(s.trim()))
  if (parts.length > 8) throw new AppError(400, "Folder nesting is too deep.")
  return parts.join("/")
}
export function emptyWorkspace(user: User): Workspace {
  return {
    version: 1,
    documents: [],
    collections: [],
    activities: [],
    connectors: [
      {
        id: "local",
        name: "Local folders",
        connected: true,
        description: "Files stored in your folder on the server.",
        account: "Your private workspace",
        folder: "Documents",
        lastSync: "",
      },
      {
        id: "drive",
        name: "Google Drive",
        connected: false,
        description: "Your originals on Drive, text and metadata in Open File.",
        account: "",
        folder: "Open File",
        lastSync: "",
      },
    ],
    settings: {
      name: user.name,
      email: user.email,
      naming: "",
      review: true,
      notifications: false,
    },
  }
}
export function defaultSecrets(): Secrets {
  return {
    ai: {
      provider: "openai",
      model: "gpt-4.1-mini",
      embeddingModel: "text-embedding-3-small",
      enabled: false,
    },
    localFolder: "Documents",
    driveFolder: "Open File",
  }
}
export function splitText(text: string) {
  const chunks: string[] = []
  for (let i = 0; i < text.length && chunks.length < 100; i += 1600)
    chunks.push(text.slice(i, i + 2000))
  return chunks
}
