import type {
  DocumentIntelligence,
  Runtime,
  WorkspaceRepository,
} from "../application/ports"
import {
  normalize,
  englishWorkspace,
  type Answer,
  type Document,
  type Workspace,
} from "../domain/workspace"
import { createFixture } from "./fixtures"
const KEY = "open-file.demo.v1"
// Read the previous key once to preserve existing demo workspaces.
const LEGACY_KEY = "auto-sort.demo.v1"
export class BrowserMockRepository implements WorkspaceRepository {
  private memory = createFixture()
  load(): Workspace {
    if (typeof window !== "undefined") {
      try {
        const raw =
          window.localStorage.getItem(KEY) ??
          window.localStorage.getItem(LEGACY_KEY)
        if (raw) {
          const state = JSON.parse(raw) as Workspace
          if (
            state.version === 1 &&
            Array.isArray(state.documents) &&
            Array.isArray(state.connectors) &&
            Array.isArray(state.activities) &&
            Array.isArray(state.collections) &&
            state.settings
          ) {
            // Project persisted demos onto the current contract without resetting documents.
            this.memory = englishWorkspace({
              version: state.version,
              documents: state.documents,
              connectors: state.connectors,
              collections: state.collections,
              activities: state.activities.filter(
                (activity) =>
                  !["Règle enregistrée", "Règle mise à jour"].includes(
                    activity.title
                  )
              ),
              settings: state.settings,
            })
            this.save(this.memory)
          }
        }
      } catch {
        /* The in-memory demo remains usable when storage is unavailable. */
      }
    }
    return structuredClone(this.memory)
  }
  save(state: Workspace) {
    this.memory = structuredClone(state)
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* Session-only fallback. */
    }
  }
  reset() {
    const state = createFixture()
    this.save(state)
    return state
  }
}
export class MockDocumentIntelligence implements DocumentIntelligence {
  constructor(private runtime: Runtime) {}
  analyze(name: string, size: number): Document {
    return {
      id: this.runtime.id(),
      name: name.replace(/\s+/g, "_"),
      originalName: name,
      kind: "Document",
      issuer: "Not specified",
      date: this.runtime.now().slice(0, 10),
      storage: "Local",
      folder: "Personal / To file",
      tags: ["Import"],
      status: "pending",
      confidence: 65,
      favorite: false,
      size: `${Math.max(1, Math.round(size / 1024))} KB`,
      content:
        "This file was added to the demo. Its content is not read, sent, or stored. OCR and AI analysis will be available when services are connected.",
      summary: "Demo import: check the name and choose the destination folder.",
      imported: true,
    }
  }
  async answer(question: string, documents: Document[]): Promise<Answer> {
    await new Promise((resolve) => setTimeout(resolve, 650))
    const terms = normalize(question)
      .split(/[^a-z0-9]+/)
      .filter(
        (word) =>
          word.length > 3 &&
          ![
            "what",
            "which",
            "where",
            "when",
            "with",
            "from",
            "have",
            "does",
            "documents",
            "find",
            "show",
            "about",
          ].includes(word)
      )
    const ranked = documents
      .filter((d) => !d.imported)
      .map((document) => ({
        document,
        score: terms.filter((t) =>
          normalize(
            document.content +
              " " +
              document.name +
              " " +
              document.tags.join(" ")
          ).includes(t)
        ).length,
      }))
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
    if (!ranked.length)
      return {
        text: "I found no matching information in the demo documents. Try a question about rent, the dishwasher warranty, or your subscriptions.",
        sources: [],
      }
    return {
      text: `Here is the information found in ${ranked.length > 1 ? "your documents" : "your document"} :\n\n${ranked.map(({ document }, i) => `${document.summary} [${i + 1}]`).join("\n\n")}`,
      sources: ranked.map(({ document }) => ({
        id: document.id,
        name: document.name,
        excerpt: document.content,
      })),
    }
  }
}
