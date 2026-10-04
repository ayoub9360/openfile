import type { ToolName } from "@open-file/core/assistant"

/** Bounded recovery for empty retrieval, never for exact counts or ordinary chat. */
export class AssistantSearchPolicy {
  private empty = false
  private found = false
  private attempted = new Set<ToolName>()
  private metadataAfterFacets = false

  observe(name: ToolName, output: unknown) {
    if (!output || typeof output !== "object") return
    const result = output as Record<string, unknown>
    if (name === "findDocuments" && this.attempted.has("listFacets"))
      this.metadataAfterFacets = true
    this.attempted.add(name)
    if ("error" in result) return
    if (name === "findDocuments" && typeof result.total === "number") {
      this.empty ||= result.total === 0
      this.found ||= result.total > 0
    }
    if (name === "searchPassages" && Array.isArray(result.passages)) {
      this.empty ||= result.passages.length === 0
      this.found ||= result.passages.length > 0
    }
  }

  next(): "searchPassages" | "listFacets" | "findDocuments" | undefined {
    if (!this.empty || this.found) return
    if (!this.attempted.has("searchPassages")) return "searchPassages"
    if (!this.attempted.has("listFacets")) return "listFacets"
    if (!this.metadataAfterFacets) return "findDocuments"
  }
}
