import { test } from "node:test"
import assert from "node:assert/strict"
import { WorkspaceService } from "./workspace-service"
import type { WorkspaceRepository } from "./ports"
import { createFixture } from "../infrastructure/fixtures"
import { MockDocumentIntelligence } from "../infrastructure/mock-adapters"
function setup() {
  let state = createFixture()
  let sequence = 0
  const repository: WorkspaceRepository = {
    load: () => structuredClone(state),
    save: (value) => {
      state = structuredClone(value)
    },
    reset: () => {
      state = createFixture()
      return state
    },
  }
  const runtime = {
    id: () => `test-${++sequence}`,
    now: () => "2026-10-02T12:00:00Z",
  }
  return new WorkspaceService(
    repository,
    new MockDocumentIntelligence(runtime),
    runtime
  )
}
test("approval updates only pending documents and undo restores their full state", () => {
  const service = setup()
  const original = service.load().documents.find((d) => d.id === "edf")!
  const updated = service.approveDocuments(["edf", "bail"])
  assert.equal(updated.documents.find((d) => d.id === "edf")?.status, "filed")
  assert.equal(updated.activities[0]?.undo?.length, 1)
  const restored = service.undoActivity(updated.activities[0]!.id)
  assert.deepEqual(
    restored.documents.find((d) => d.id === "edf"),
    original
  )
  assert.throws(() => service.undoActivity(updated.activities[0]!.id))
})
test("invalid edits do not change stored documents or history", () => {
  const service = setup()
  const original = service.load()
  assert.throws(() =>
    service.saveDocument(
      { ...original.documents[0]!, name: "wrong/path.pdf" },
      true
    )
  )
  assert.throws(() =>
    service.saveDocument({ ...original.documents[0]!, folder: " " }, true)
  )
  assert.deepEqual(service.load(), original)
})
test("import stores metadata only and requires a review", () => {
  const service = setup()
  const state = service.importFiles([{ name: "my file.pdf", size: 2048 }])
  assert.equal(state.documents[0]?.name, "my_file.pdf")
  assert.equal(state.documents[0]?.status, "pending")
  assert.equal(state.documents[0]?.imported, true)
  assert.equal(state.documents[0]?.size, "2 KB")
})
test("mock answers cite matching examples, respect scope and exclude archives", async () => {
  const service = setup()
  const answer = await service.answer("dishwasher warranty")
  assert.equal(answer.sources[0]?.id, "darty")
  assert.match(answer.text, /2028/)
  assert.equal(
    (await service.answer("dishwasher warranty", ["edf"])).sources.length,
    0
  )
  service.archiveDocument("darty")
  assert.equal((await service.answer("dishwasher")).sources.length, 0)
})
test("disconnected connectors cannot be synchronized", () => {
  const service = setup()
  assert.throws(() => service.syncConnector("dropbox"))
  service.toggleConnector("dropbox")
  assert.equal(
    service.syncConnector("dropbox").connectors.find((c) => c.id === "dropbox")
      ?.lastSync,
    "2026-10-02T12:00:00Z"
  )
})

test("stored demos drop obsolete data while preserving the current workspace", async (t) => {
  const { BrowserMockRepository } =
    await import("../infrastructure/mock-adapters")
  const expected = createFixture()
  let raw = JSON.stringify({
    ...expected,
    rules: [{ id: "legacy", enabled: true }],
    activities: [
      {
        id: "old",
        title: "Règle enregistrée",
        detail: "Ancienne",
        date: "2026-01-01",
      },
      ...expected.activities,
    ],
  })
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window")
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous)
    else Reflect.deleteProperty(globalThis, "window")
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => raw,
        setItem: (_key: string, value: string) => {
          raw = value
        },
      },
    },
  })
  const repository = new BrowserMockRepository()
  assert.deepEqual(repository.load(), expected)
  assert.deepEqual(JSON.parse(raw), expected)
  assert.deepEqual(repository.load(), expected)
})

test("renamed demos preserve saved documents and prefer the new storage key", async (t) => {
  const { BrowserMockRepository } =
    await import("../infrastructure/mock-adapters")
  const state = createFixture()
  state.documents[0]!.name = "My saved document.pdf"
  const drive = state.connectors.find((connector) => connector.id === "drive")!
  drive.folder = "Auto Sort"
  drive.description = "Your originals on Drive, text and metadata in Auto Sort."
  const storage = new Map([["auto-sort.demo.v1", JSON.stringify(state)]])
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window")
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous)
    else Reflect.deleteProperty(globalThis, "window")
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  })
  const repository = new BrowserMockRepository()
  const result = repository.load()
  assert.deepEqual(result.documents, state.documents)
  assert.equal(
    result.connectors.find((c) => c.id === "drive")!.folder,
    "Auto Sort"
  )
  assert.equal(
    result.connectors.find((c) => c.id === "drive")!.description,
    "Your originals on Drive, text and metadata in Open File."
  )
  assert.deepEqual(JSON.parse(storage.get("open-file.demo.v1")!), result)
  result.documents[0]!.name = "Updated document.pdf"
  repository.save(result)
  assert.equal(
    new BrowserMockRepository().load().documents[0]!.name,
    "Updated document.pdf"
  )
})

test("legacy labels become English while user documents and paths remain intact", async () => {
  const { englishWorkspace, englishNamingTemplate } =
    await import("../domain/workspace")
  const state = createFixture()
  const document = state.documents[0]!
  Object.assign(document, {
    kind: "Facture",
    name: "facture_électricité.pdf",
    folder: "Personnel/Électricité",
    content: "Ma facture d’électricité",
    tags: ["Électricité"],
    issuer: "À renseigner",
    size: "1,2 Mo",
    summary: "Analyse en attente",
    processingWarning:
      "Recherche sémantique indisponible : L’analyse IA n’a pas abouti. Vérifiez votre connexion et le modèle choisi, puis réessayez.",
  })
  state.activities = [
    {
      id: "legacy",
      title: "Document classé",
      detail: document.name,
      date: document.date,
      undo: [document],
    },
  ]
  state.settings.naming = "custom_{émetteur}_{date}"
  const result = englishWorkspace(state)
  assert.equal(result.documents[0]!.kind, "Invoice")
  assert.equal(result.documents[0]!.issuer, "Not specified")
  assert.equal(result.documents[0]!.size, "1.2 MB")
  assert.equal(result.documents[0]!.summary, "Awaiting analysis")
  assert.match(
    result.documents[0]!.processingWarning!,
    /^Semantic search unavailable: AI analysis failed\./
  )
  for (const field of ["name", "folder", "content", "tags"] as const)
    assert.deepEqual(result.documents[0]![field], document[field])
  assert.equal(result.activities[0]!.title, "Document filed")
  assert.equal(result.activities[0]!.detail, document.name)
  assert.equal(result.activities[0]!.undo![0]!.kind, "Invoice")
  assert.equal(result.settings.naming, "custom_{issuer}_{date}")
  assert.equal(englishNamingTemplate("{date}_{type}_{émetteur}"), "")
  assert.deepEqual(englishWorkspace(result), result)
  assert.equal(state.documents[0]!.kind as string, "Facture")
})

test("editing legacy collections replaces tags without duplicating the collection or changing documents", () => {
  const service = setup()
  const before = service.load()
  const collection = before.collections[0]!
  const updated = service.saveCollection({
    ...collection,
    tags: ["Travel", "Work", "Travel"],
  })
  assert.equal(updated.collections.length, before.collections.length)
  assert.deepEqual(
    updated.collections.find((c) => c.id === collection.id)?.tags,
    ["Travel", "Work"]
  )
  assert.deepEqual(updated.documents, before.documents)
  const removed = service.saveCollection({ ...collection, tags: ["Work"] })
  assert.deepEqual(
    removed.collections.find((c) => c.id === collection.id)?.tags,
    ["Work"]
  )
  assert.throws(() => service.saveCollection({ ...collection, tags: [] }))
  assert.deepEqual(service.load(), removed)
})
