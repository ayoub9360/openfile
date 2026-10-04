"use client"
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { BrandLogo } from "./components/brand-logo"
import type { WorkspaceClient } from "../application/workspace-client"
import type { Workspace } from "../domain/workspace"
interface Context {
  state: Workspace
  service: WorkspaceClient
  run: (action: () => Promise<Workspace>, message?: string) => Promise<boolean>
  notify: (message: string) => void
  accept: (state: Workspace) => void
  importId: string | null
  openImport: (id?: string) => void
  importing: boolean
  closeImport: () => void
}
const WorkspaceContext = createContext<Context | null>(null)
class WorkspaceController {
  private snapshot: { state: Workspace | null; error: string } = {
    state: null,
    error: "",
  }
  private listeners = new Set<() => void>()
  private started = false
  private revision = 0
  constructor(private service: WorkspaceClient) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    if (!this.started) {
      this.started = true
      void this.refresh()
    }
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.snapshot
  getServerSnapshot = () => serverSnapshot
  update(state: Workspace) {
    this.revision++
    this.snapshot = { state, error: "" }
    this.listeners.forEach((l) => l())
  }
  refresh = async () => {
    const revision = this.revision
    try {
      const state = await this.service.load()
      if (this.revision === revision) this.update(state)
    } catch (e) {
      this.snapshot = {
        ...this.snapshot,
        error:
          e instanceof Error ? e.message : "Unable to connect to the server.",
      }
      this.listeners.forEach((l) => l())
    }
  }
}
const serverSnapshot = { state: null, error: "" }
export function WorkspaceProvider({
  service,
  children,
}: {
  service: WorkspaceClient
  children: ReactNode
}) {
  const [controller] = useState(() => new WorkspaceController(service))
  const { state, error } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot
  )
  const [toast, setToast] = useState("")
  const [importId, setImportId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 6500)
      return () => clearTimeout(timer)
    }
  }, [toast])
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") void controller.refresh()
      },
      state?.documents.some(
        (d) => d.processing === "queued" || d.processing === "processing"
      )
        ? 2000
        : 15000
    )
    return () => clearInterval(timer)
  }, [controller, state])
  async function run(
    action: () => Promise<Workspace>,
    message = "Changes saved"
  ) {
    try {
      controller.update(await action())
      setToast(message)
      return true
    } catch (e) {
      setToast(e instanceof Error ? e.message : "An error occurred.")
      await controller.refresh()
      return false
    }
  }
  if (!state)
    return (
      <div className="app-loading">
        <BrandLogo variant="icon" className="loading-logo" />
        <p>{error || "Preparing your workspace…"}</p>
        {error && (
          <button onClick={() => void controller.refresh()}>Try again</button>
        )}
      </div>
    )
  return (
    <WorkspaceContext.Provider
      value={{
        state,
        service,
        run,
        notify: setToast,
        accept: (next) => controller.update(next),
        importId,
        openImport: (id) => {
          setImportId(id ?? null)
          setImporting(true)
        },
        importing,
        closeImport: () => setImporting(false),
      }}
    >
      {error && (
        <div role="alert" className="subtle-note">
          {error}
        </div>
      )}
      {children}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
    </WorkspaceContext.Provider>
  )
}
export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error("Missing WorkspaceProvider")
  return context
}
