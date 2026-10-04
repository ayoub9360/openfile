import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { readFile } from "node:fs/promises"
import { AppError } from "../domain/model"

let active = 0
// No queue of large buffers. Callers can retry once a decoder is available.
export async function parseIsolated(
  mode: "preview" | "text",
  bytes: Uint8Array,
  mime: string,
  options: { timeoutMs?: number; entry?: string } = {}
) {
  if (active >= 2)
    throw new AppError(
      503,
      "Document decoder is busy. Try again shortly.",
      true
    )
  if (bytes.byteLength > 20 * 1024 * 1024)
    throw new AppError(413, "File exceeds 20 MB.")
  if (process.platform !== "linux")
    throw new AppError(
      503,
      "Document decoding requires the Linux/Docker runtime."
    )
  active++
  try {
    return await new Promise<string | Uint8Array>((resolve, reject) => {
      const development = import.meta.url.endsWith(".ts")
      const entry =
        options.entry ??
        fileURLToPath(
          new URL(
            development
              ? "../../dist/infrastructure/parser-child.js"
              : "./infrastructure/parser-child.js",
            import.meta.url
          )
        )
      // RLIMIT_AS also bounds native allocations; disabling JIT/Wasm avoids V8's
      // multi-gigabyte virtual reservations. Children never receive app secrets.
      const child = spawn(
        "prlimit",
        [
          "--as=2147483648",
          "--data=536870912",
          "--core=0",
          "--cpu=20",
          "--nofile=64",
          "--",
          process.execPath,
          "--jitless",
          "--no-expose-wasm",
          "--v8-pool-size=1",
          "--max-old-space-size=128",
          entry,
        ],
        {
          env: {
            PATH: process.env.PATH ?? "/usr/bin:/bin",
            NODE_ENV: "production",
            UV_THREADPOOL_SIZE: "1",
            MALLOC_ARENA_MAX: "2",
            RAYON_NUM_THREADS: "1",
          },
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          serialization: "advanced",
        }
      )
      let response:
        { result?: string | Uint8Array; error?: boolean } | undefined
      let failed = false
      const stop = () => {
        failed = true
        child.kill("SIGKILL")
      }
      const timeout = setTimeout(stop, options.timeoutMs ?? 30000)
      // Additional resident-memory ceiling, on top of the kernel address-space cap.
      const memory = setInterval(() => {
        if (child.pid)
          void readFile(`/proc/${child.pid}/status`, "utf8")
            .then((status) => {
              const kib = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0)
              if (kib > 384 * 1024) stop()
            })
            .catch(() => {})
      }, 50)
      child.once("message", (value) => {
        response = value as typeof response
      })
      const cleanup = () => {
        clearTimeout(timeout)
        clearInterval(memory)
      }
      child.once("error", () => {
        cleanup()
        reject(new AppError(503, "Document decoder could not start."))
      })
      child.once("exit", (code) => {
        cleanup()
        if (
          failed ||
          code !== 0 ||
          response?.error ||
          response?.result === undefined
        )
          reject(
            new AppError(
              422,
              "Document could not be decoded within the safety limits (20 MB, 200 pages, 16 million pixels)."
            )
          )
        else resolve(response.result)
      })
      child.send({ mode, bytes, mime }, (error) => {
        if (error) stop()
      })
    })
  } finally {
    active--
  }
}
