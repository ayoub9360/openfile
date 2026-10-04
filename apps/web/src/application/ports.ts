import type { Answer, Document, Workspace } from "../domain/workspace"
export interface WorkspaceRepository {
  load(): Workspace
  save(workspace: Workspace): void
  reset(): Workspace
}
export interface DocumentIntelligence {
  analyze(name: string, size: number): Document
  answer(question: string, documents: Document[]): Promise<Answer>
}
export interface Runtime {
  id(): string
  now(): string
}
