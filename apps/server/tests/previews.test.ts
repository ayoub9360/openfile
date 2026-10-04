import { test } from "node:test"
import assert from "node:assert/strict"
import { createCanvas, loadImage } from "@napi-rs/canvas"
import { renderPreview } from "../src/infrastructure/preview-renderer"
import { Previews } from "../src/application/previews"
import type { Repository, StorageRegistry } from "../src/application/ports"
import type { FileRef } from "../src/domain/model"

test("image thumbnails preserve proportions and cap their dimensions", async () => {
  const canvas = createCanvas(1200, 600)
  canvas.getContext("2d").fillRect(0, 0, 1200, 600)
  for (const format of ["png", "jpeg", "webp"] as const) {
    const bytes =
      format === "png"
        ? await canvas.encode("png")
        : await canvas.encode(format)
    const result = await loadImage(
      await renderPreview(bytes, `image/${format}`)
    )
    assert.equal(result.width, 640)
    assert.equal(result.height, 320)
  }
})

// Two colored pages verify that only the first page is rendered.
function pdf() {
  const stream = (color: string) => {
    const data = `${color} rg 0 0 200 300 re f\n`
    return `<< /Length ${data.length} >>\nstream\n${data}endstream`
  }
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 4 0 R >>",
    stream("1 0 0"),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 6 0 R >>",
    stream("0 0 1"),
  ]
  return pdfObjects(objects)
}

function pdfObjects(objects: string[]) {
  let text = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(text))
    text += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const start = Buffer.byteLength(text)
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
  return Buffer.from(text)
}

test("PDF thumbnail renders the whole first page and rejects corrupt files", async () => {
  const image = await loadImage(await renderPreview(pdf(), "application/pdf"))
  assert.equal(image.width, 320)
  assert.equal(image.height, 480)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext("2d")
  context.drawImage(image, 0, 0)
  const pixel = context.getImageData(160, 240, 1, 1).data
  assert.ok(pixel[0]! > 240 && pixel[2]! < 10)
  await assert.rejects(renderPreview(Buffer.from("broken"), "application/pdf"))
})

test("PDF text renders without relying on canvas system fonts", async (t) => {
  const context = createCanvas(1, 1).getContext("2d")
  // Without PDF.js font data, rendering falls back to system-dependent fillText.
  // Reject that fallback so this test also catches the bug on font-rich machines.
  t.mock.method(Object.getPrototypeOf(context), "fillText", () => {
    throw new Error("PDF text must render from bundled glyphs")
  })
  for (const font of ["TimesNewRoman", "TimesNewRoman,Bold", "Helvetica", "Courier"]) {
    const data = "BT /F1 24 Tf 20 100 Td (Preview 2022) Tj ET\n"
    const bytes = pdfObjects([
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${data.length} >>\nstream\n${data}endstream`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /${font} >>`,
    ])
    const image = await loadImage(await renderPreview(bytes, "application/pdf"))
    const canvas = createCanvas(image.width, image.height)
    const rendered = canvas.getContext("2d")
    rendered.drawImage(image, 0, 0)
    const pixels = rendered.getImageData(0, 0, image.width, image.height).data
    let darkPixels = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i]! < 100 && pixels[i + 3]! > 200) darkPixels++
    }
    assert.ok(darkPixels > 100, `${font} must produce visible text`)
  }
})

test("cache deduplicates rendering, rechecks ownership and invalidates moved files", async () => {
  let ref: FileRef | undefined = {
    storage: "Local",
    key: "a",
    mimeType: "image/png",
    bytes: 3,
  }
  let reads = 0
  const repository = {
    file: async (user: string) => (user === "alice" ? ref : undefined),
  } satisfies Pick<Repository, "file">
  const storage = {
    get: () => ({
      read: async () => {
        reads++
        return new Uint8Array([1])
      },
    }),
  } as unknown as StorageRegistry
  const previews = new Previews(repository, storage, async (bytes) => bytes)
  const user = { id: "alice", email: "alice@example.com", name: "Alice" }
  await Promise.all([previews.get(user, "doc"), previews.get(user, "doc")])
  await previews.get(user, "doc")
  assert.equal(reads, 1)
  await assert.rejects(previews.get({ ...user, id: "bob" }, "doc"), {
    status: 404,
  })
  ref = { ...ref, key: "b" }
  await previews.get(user, "doc")
  assert.equal(reads, 2)
  ref = undefined
  await assert.rejects(previews.get(user, "doc"), { status: 404 })
})

test("failed rendering can be retried and does not block later previews", async () => {
  const repository = {
    file: async () => ({
      storage: "Local",
      key: "a",
      mimeType: "image/png",
      bytes: 3,
    }),
  } satisfies Pick<Repository, "file">
  const storage = {
    get: () => ({ read: async () => new Uint8Array([1]) }),
  } as unknown as StorageRegistry
  let fail = true
  const previews = new Previews(repository, storage, async (bytes) => {
    if (fail) throw new Error("Corrupt image")
    return bytes
  })
  const user = { id: "alice", email: "alice@example.com", name: "Alice" }
  await assert.rejects(previews.get(user, "doc"), { status: 422 })
  fail = false
  assert.deepEqual(await previews.get(user, "doc"), new Uint8Array([1]))
})
