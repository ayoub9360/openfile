import { imageSize } from "image-size"
import { PDFParse } from "pdf-parse"
import { createCanvas, loadImage } from "@napi-rs/canvas"
import { createRequire } from "node:module"
import { dirname, join, sep } from "node:path"

// Resolve the fonts shipped with the exact PDF.js version used by pdf-parse.
// Server images may not have system fonts for PDFs with non-embedded fonts.
const pdfRequire = createRequire(
  createRequire(import.meta.url).resolve("pdf-parse")
)
const standardFontDataUrl =
  join(
    dirname(pdfRequire.resolve("pdfjs-dist/package.json")),
    "standard_fonts"
  ) + sep

const pdfOptions = {
  maxImageSize: 16_000_000,
  useWasm: false,
  isEvalSupported: false,
}
function checkImage(bytes: Uint8Array) {
  const size = imageSize(bytes)
  if (
    !size.width ||
    !size.height ||
    size.width * size.height > 16_000_000 ||
    size.width > 16384 ||
    size.height > 16384
  )
    throw new Error("Image dimensions exceed the limit")
}
export async function extractText(bytes: Uint8Array, mime: string) {
  if (mime !== "application/pdf") return ""
  const parser = new PDFParse({ data: bytes, ...pdfOptions })
  try {
    const info = await parser.getInfo()
    if (info.total > 200) throw new Error("PDF exceeds 200 pages")
    let text = ""
    for (let page = 1; page <= info.total && text.length < 160000; page++) {
      const result = await parser.getText({ partial: [page] })
      text += result.pages.map((p) => p.text).join("\n\n") + "\n\n"
    }
    return text.replaceAll("\0", "").trim().slice(0, 160000)
  } finally {
    await parser.destroy()
  }
}
export async function renderPreview(bytes: Uint8Array, mime: string) {
  let image = bytes
  if (mime === "application/pdf") {
    const parser = new PDFParse({
      data: bytes,
      standardFontDataUrl,
      ...pdfOptions,
    })
    try {
      const info = await parser.getInfo({ partial: [1], parsePageInfo: true })
      if (info.total > 200) throw new Error("PDF exceeds 200 pages")
      const size = info.pages[0]
      if (!size || size.width <= 0 || size.height <= 0)
        throw new Error("Invalid PDF page")
      const result = await parser.getScreenshot({
        partial: [1],
        scale: Math.min(640 / size.width, 480 / size.height),
        imageDataUrl: false,
        imageBuffer: true,
      })
      const page = result.pages[0]
      if (!page) throw new Error("Empty PDF")
      image = page.data
    } finally {
      await parser.destroy()
    }
  }
  checkImage(image)
  const source = await loadImage(Buffer.from(image))
  if (!source.width || !source.height) throw new Error("Empty image")
  const scale = Math.min(640 / source.width, 480 / source.height, 1)
  const canvas = createCanvas(
    Math.max(1, Math.round(source.width * scale)),
    Math.max(1, Math.round(source.height * scale))
  )
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.encode("webp", 82)
}
