import { extractText, renderPreview } from "./parser-engine"
process.once(
  "message",
  async (input: {
    mode: "preview" | "text"
    bytes: Uint8Array
    mime: string
  }) => {
    try {
      const result =
        input.mode === "preview"
          ? await renderPreview(input.bytes, input.mime)
          : await extractText(input.bytes, input.mime)
      process.send?.({ result }, () => process.exit(0))
    } catch {
      process.send?.({ error: true }, () => process.exit(1))
    }
  }
)
