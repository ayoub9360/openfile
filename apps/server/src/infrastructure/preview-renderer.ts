import { parseIsolated } from "./parser-process"
export async function renderPreview(bytes: Uint8Array, mime: string) {
  return (await parseIsolated("preview", bytes, mime)) as Uint8Array
}
