import type { Runtime } from "../application/ports"

export function createBrowserRuntime(): Runtime {
  return {
    id: () => {
      if (typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID()
      }
      // Unlike randomUUID, getRandomValues also works on HTTP network origins.
      return Array.from(
        globalThis.crypto.getRandomValues(new Uint8Array(16)),
        (byte) => byte.toString(16).padStart(2, "0")
      ).join("")
    },
    now: () => new Date().toISOString(),
  }
}
