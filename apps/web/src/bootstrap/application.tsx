"use client"
import { useState, type ReactNode } from "react"
import { createWorkspace } from "./create-workspace"
import { WorkspaceProvider } from "../presentation/workspace-context"
import { AuthGate } from "../presentation/auth-gate"
import { Shell } from "../presentation/shell"

export function Application({ children }: { children: ReactNode }) {
  const [service] = useState(createWorkspace)
  return (
    <AuthGate>
      <WorkspaceProvider service={service}>
        <Shell>{children}</Shell>
      </WorkspaceProvider>
    </AuthGate>
  )
}
