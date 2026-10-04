import { HttpWorkspace } from "../infrastructure/http-workspace"
import type { WorkspaceClient } from "../application/workspace-client"
/** Composition root: the presentation only depends on the application port. */
export function createWorkspace(): WorkspaceClient {
  return new HttpWorkspace()
}
