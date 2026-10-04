import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile, unlink, realpath } from "node:fs/promises"
import { resolve, dirname, sep } from "node:path"
import type {
  FileStorage,
  SecretStore,
  StorageRegistry,
} from "../application/ports"
import {
  AppError,
  safeFolder,
  safeSegment,
  type FileRef,
} from "../domain/model"
export class LocalStorage implements FileStorage {
  constructor(private root: string) {}
  private async path(user: string, key: string) {
    const base = resolve(this.root, safeSegment(user))
    const target = resolve(base, key)
    if (!target.startsWith(base + sep)) throw new AppError(400, "Invalid path.")
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    const canonicalBase = await realpath(base)
    const parent = await realpath(dirname(target))
    if (parent !== canonicalBase && !parent.startsWith(canonicalBase + sep))
      throw new AppError(400, "Invalid path.")
    return target
  }
  async put(
    user: string,
    bytes: Uint8Array,
    name: string,
    folder: string,
    mimeType: string
  ): Promise<FileRef> {
    const key = `${safeFolder(folder)}/${randomUUID()}/${safeSegment(name)}`
    await writeFile(await this.path(user, key), bytes, {
      flag: "wx",
      mode: 0o600,
    })
    return { storage: "Local", key, mimeType, bytes: bytes.length }
  }
  async read(user: string, ref: FileRef) {
    return readFile(await this.path(user, ref.key))
  }
  async remove(user: string, ref: FileRef) {
    await unlink(await this.path(user, ref.key)).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e
      }
    )
  }
}
export class DriveStorage implements FileStorage {
  constructor(
    private secrets: SecretStore,
    private clientId: string,
    private clientSecret: string
  ) {}
  async token(user: string) {
    const settings = await this.secrets.get(user)
    if (!settings.driveRefreshToken)
      throw new AppError(412, "Connect Google Drive in settings.")
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: settings.driveRefreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok)
      throw new AppError(502, "Google Drive needs to be reconnected.")
    return ((await response.json()) as { access_token: string }).access_token
  }
  private async request(token: string, path: string, init?: RequestInit) {
    const response = await fetch(`https://www.googleapis.com/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init?.headers },
      signal: AbortSignal.timeout(60000),
    })
    if (!response.ok && !(init?.method === "DELETE" && response.status === 404))
      throw new AppError(502, "Google Drive could not complete this operation.")
    return response
  }
  private async folder(token: string, name: string, parent?: string) {
    const escape = (s: string) =>
      s.replaceAll("\\", "\\\\").replaceAll("'", "\\'")
    const query = `trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${escape(name)}' and '${escape(parent ?? "root")}' in parents`
    const result = (await (
      await this.request(
        token,
        `drive/v3/files?${new URLSearchParams({ q: query, fields: "files(id)", pageSize: "1" })}`
      )
    ).json()) as { files: { id: string }[] }
    if (result.files[0]) return result.files[0].id
    const created = (await (
      await this.request(token, "drive/v3/files?fields=id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
          ...(parent ? { parents: [parent] } : {}),
        }),
      })
    ).json()) as { id: string }
    return created.id
  }
  async put(
    user: string,
    bytes: Uint8Array,
    name: string,
    folder: string,
    mimeType: string
  ): Promise<FileRef> {
    const token = await this.token(user)
    const settings = await this.secrets.get(user)
    let parent = settings.driveRootId
    if (!parent) {
      parent = await this.folder(token, settings.driveFolder)
      await this.secrets.update(user, (s) => ({ ...s, driveRootId: parent }))
    }
    for (const segment of safeFolder(folder).split("/"))
      parent = await this.folder(token, segment, parent)
    const boundary = `openfile_${randomUUID()}`
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: safeSegment(name), parents: [parent] })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
      ),
      Buffer.from(bytes),
      Buffer.from(`\r\n--${boundary}--`),
    ])
    const result = (await (
      await this.request(
        token,
        "upload/drive/v3/files?uploadType=multipart&fields=id",
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      )
    ).json()) as { id: string }
    return {
      storage: "Google Drive",
      key: result.id,
      mimeType,
      bytes: bytes.length,
    }
  }
  async read(user: string, ref: FileRef) {
    const response = await this.request(
      await this.token(user),
      `drive/v3/files/${encodeURIComponent(ref.key)}?alt=media`
    )
    const reader = response.body?.getReader()
    if (!reader) throw new AppError(502, "Empty Drive file.")
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        length += value.length
        if (length > 20 * 1024 * 1024)
          throw new AppError(413, "The Drive file exceeds 20 MB.")
        chunks.push(value)
      }
    } finally {
      await reader.cancel()
    }
    return Buffer.concat(chunks)
  }
  async remove(user: string, ref: FileRef) {
    await this.request(
      await this.token(user),
      `drive/v3/files/${encodeURIComponent(ref.key)}`,
      { method: "DELETE" }
    )
  }
}
export class Storages implements StorageRegistry {
  constructor(
    private local: LocalStorage,
    private drive: DriveStorage
  ) {}
  get(storage: "Local" | "Google Drive") {
    return storage === "Local" ? this.local : this.drive
  }
}
