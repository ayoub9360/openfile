import type { Document } from "../domain/workspace"
export function childFolders(documents: Document[], parent: string) {
  const result = new Map<
    string,
    { path: string; name: string; storage: string; count: number }
  >()
  for (const document of documents) {
    if (document.status !== "filed") continue
    const path = document.folder
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .join("/")
    if (parent && !path.startsWith(parent + "/")) continue
    const rest = parent ? path.slice(parent.length + 1) : path
    if (!rest) continue
    const name = rest.split("/")[0]!
    const folder = parent ? `${parent}/${name}` : name
    const key = `${document.storage}:${folder}`
    const existing = result.get(key)
    if (existing) existing.count++
    else
      result.set(key, {
        path: folder,
        name,
        storage: document.storage,
        count: 1,
      })
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, "en"))
}
