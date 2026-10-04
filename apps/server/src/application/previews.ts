import type { Repository, StorageRegistry } from "./ports"
import { AppError, type User } from "../domain/model"

export class Previews {
  private cache = new Map<string, { data: Uint8Array; expires: number }>()
  private pending = new Map<string, Promise<Uint8Array>>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private repository: Pick<Repository, "file">,
    private storage: StorageRegistry,
    private render: (data: Uint8Array, mime: string) => Promise<Uint8Array>
  ) {}

  async get(user: User, id: string) {
    // Check ownership even on cache hits. Moving a file changes its cache key.
    const ref = await this.repository.file(user.id, id)
    if (!ref) throw new AppError(404, "File not found.")
    if (
      !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
        ref.mimeType
      )
    )
      throw new AppError(415, "Preview unavailable for this format.")
    const key = JSON.stringify([user.id, id, ref])
    const cached = this.cache.get(key)
    if (cached && cached.expires > Date.now()) return cached.data
    this.cache.delete(key)
    const pending = this.pending.get(key)
    if (pending) return pending
    if (this.pending.size >= 64)
      throw new AppError(503, "Preview service is busy. Try again later.")

    // Serialize rendering to avoid decoding many large documents at once.
    const job = this.queue
      .then(async () => {
        const bytes = await this.storage.get(ref.storage).read(user.id, ref)
        let data: Uint8Array
        try {
          data = await this.render(bytes, ref.mimeType)
        } catch {
          throw new AppError(422, "Preview unavailable for this file.")
        }
        if (this.cache.size >= 64)
          this.cache.delete(this.cache.keys().next().value!)
        this.cache.set(key, { data, expires: Date.now() + 5 * 60_000 })
        return data
      })
      .finally(() => this.pending.delete(key))
    this.pending.set(key, job)
    this.queue = job.catch(() => {})
    return job
  }
}
