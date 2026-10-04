import type { Workspace } from "@open-file/core/workspace"
import type {
  Analysis,
  Chunk,
  FileRef,
  Secrets,
  Source,
  User,
} from "../domain/model"
export interface UnitOfWork {
  checkCapacity(bytes: number, newDocument: boolean): Promise<void>
  purgeConversations(documentId: string): Promise<void>
  state: Workspace
  file(id: string): Promise<FileRef | undefined>
  setFile(id: string, file: FileRef): Promise<void>
  deleteFile(id: string): Promise<void>
  enqueue(
    type: "analyze" | "cleanup",
    documentId: string,
    payload?: FileRef
  ): Promise<void>
  setChunks(id: string, chunks: Chunk[]): Promise<void>
}
export interface Repository {
  load(user: User): Promise<Workspace>
  transaction<T>(
    user: User,
    action: (unit: UnitOfWork) => Promise<T>
  ): Promise<T>
  file(userId: string, id: string): Promise<FileRef | undefined>
  search(
    userId: string,
    question: string,
    ids?: string[],
    embedding?: number[],
    model?: string
  ): Promise<Source[]>
}
export interface SecretStore {
  get(userId: string): Promise<Secrets>
  update(userId: string, change: (value: Secrets) => Secrets): Promise<Secrets>
}
export interface FileStorage {
  put(
    userId: string,
    bytes: Uint8Array,
    name: string,
    folder: string,
    mimeType: string
  ): Promise<FileRef>
  read(userId: string, ref: FileRef): Promise<Uint8Array>
  remove(userId: string, ref: FileRef): Promise<void>
}
export interface StorageRegistry {
  get(storage: "Local" | "Google Drive"): FileStorage
}
export interface Intelligence {
  analyze(
    userId: string,
    bytes: Uint8Array,
    mimeType: string,
    name: string,
    text: string,
    folders?: string[]
  ): Promise<Analysis>
  embed(
    userId: string,
    texts: string[],
    signal?: AbortSignal
  ): Promise<{ vectors: number[][]; model: string } | undefined>
  answer(userId: string, question: string, sources: Source[]): Promise<string>
}
export interface TextExtractor {
  extract(bytes: Uint8Array, mimeType: string): Promise<string>
}
