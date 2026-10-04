import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { app } from "../src/http/app"
import {
  pool,
  secretPool,
  documents,
  repository,
  secrets,
  storage,
} from "../src/bootstrap"
import { migrate } from "../src/migrate"
import { LocalStorage } from "../src/infrastructure/storage"
import type { Workspace } from "@open-file/core/workspace"
import { createCanvas, loadImage } from "@napi-rs/canvas"
let server: Server
let base: string
const users: { id: string; email: string; name: string; cookie: string }[] = []
before(async () => {
  await migrate(pool)
  server = app.listen(0, "127.0.0.1")
  await new Promise<void>((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})
after(async () => {
  for (const u of users) {
    const s = await repository.load(u)
    for (const d of s.documents) {
      const ref = await repository.file(u.id, d.id)
      if (ref) await storage.get(ref.storage).remove(u.id, ref)
    }
    await pool.query('DELETE FROM "user" WHERE id=$1', [u.id])
  }
  await new Promise<void>((r) => server.close(() => r()))
  await Promise.all([pool.end(), secretPool.end()])
})
async function api(
  path: string,
  user?: (typeof users)[number],
  method = "GET",
  body?: unknown,
  origin = "http://localhost:3000"
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(user ? { Cookie: user.cookie } : {}),
      Origin: origin,
      ...(path.startsWith("/auth/sign-up")
        ? { "x-signup-token": process.env.SIGNUP_TOKEN! }
        : {}),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  })
  return response
}
async function account() {
  const email = `test-${randomUUID()}@example.com`
  const response = await api("/auth/sign-up/email", undefined, "POST", {
    name: "Test",
    email,
    password: randomUUID(),
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  const user = {
    ...body.user,
    cookie: response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  }
  users.push(user)
  return user
}
test("authentication, uploads, ownership, index, classification and encrypted settings", async () => {
  assert.equal((await api("/workspace")).status, 401)
  const alice = await account()
  const bob = await account()
  assert.equal(
    (await api("/settings", alice, "PUT", {}, "https://untrusted.example"))
      .status,
    403
  )
  const payload =
    "ORCHIDEE invoice: amount 150 euros. Internet subscription for February 2026."
  const form = new FormData()
  form.append("storage", "Local")
  form.append(
    "files",
    new Blob([payload], { type: "text/plain" }),
    "invoice.txt"
  )
  const uploaded = await api("/documents", alice, "POST", form)
  assert.equal(uploaded.status, 200)
  const upload = await uploaded.json()
  assert.deepEqual(upload.errors, [])
  const document = upload.state.documents[0]
  assert.equal(document.processing, "queued")
  assert.equal(
    (
      await pool.query(
        "SELECT status FROM jobs WHERE user_id=$1 AND document_id=$2",
        [alice.id, document.id]
      )
    ).rows[0].status,
    "queued"
  )
  assert.equal((await api(`/documents/${document.id}/file`, bob)).status, 404)
  assert.equal(
    (await api(`/documents/${document.id}/preview`, alice)).status,
    415
  )
  assert.equal(
    (await api(`/documents/${document.id}/favorite`, bob, "POST")).status,
    404
  )
  assert.equal(
    (await (await api("/workspace", bob)).json()).documents.length,
    0
  )
  await documents.analyze(alice, document.id)
  const state = (await (await api("/workspace", alice)).json()) as Workspace
  const doc = state.documents[0]!
  assert.equal(doc.processing, "ready")
  assert.equal(doc.content, payload)
  const answer = await (
    await api("/search/answer", alice, "POST", { question: "ORCHIDEE" })
  ).json()
  assert.deepEqual(answer.sources, []) // An unconfirmed upload is not in the library.
  assert.deepEqual(
    (
      await (
        await api("/search/answer", bob, "POST", {
          question: "ORCHIDEE",
          ids: [doc.id],
        })
      ).json()
    ).sources,
    []
  )
  assert.equal(
    (
      await api(`/documents/${doc.id}`, alice, "PUT", {
        document: { ...doc, folder: "../../escape" },
      })
    ).status,
    400
  )
  const saved = await api(`/documents/${doc.id}`, alice, "PUT", {
    document: { ...doc, name: "2026_invoice.txt", folder: "Accounting/2026" },
    approve: true,
  })
  assert.equal(saved.status, 200)
  assert.equal((await saved.json()).documents[0].status, "filed")
  const found = await (
    await api("/search/answer", alice, "POST", {
      question: "Find my ORCHIDEE invoice",
    })
  ).json()
  assert.equal(found.sources[0].id, doc.id)
  const englishSearch = await (
    await api("/search/answer", alice, "POST", { question: "subscriptions" })
  ).json()
  assert.equal(englishSearch.sources[0]?.id, doc.id)
  assert.match(englishSearch.text, /^AI disabled:/)
  assert.equal(
    await (await api(`/documents/${doc.id}/file`, alice)).text(),
    payload
  )
  assert.equal(
    (await api(`/documents/${doc.id}`, alice, "PUT", { document: doc })).status,
    409
  )
  const cleanup = await pool.query(
    "SELECT payload FROM jobs WHERE user_id=$1 AND kind='cleanup'",
    [alice.id]
  )
  for (const row of cleanup.rows)
    await documents.cleanup(alice, doc.id, row.payload)
  const key = "sk-test-not-a-real-api-key"
  const settings = await api("/integrations", alice, "PUT", {
    ai: {
      provider: "openai",
      model: "gpt-4.1-mini",
      embeddingModel: "text-embedding-3-small",
      enabled: false,
      apiKey: key,
    },
  })
  assert.equal(settings.status, 200)
  assert.equal((await settings.text()).includes(key), false)
  const encrypted = (
    await pool.query("SELECT ciphertext FROM user_secrets WHERE user_id=$1", [
      alice.id,
    ])
  ).rows[0].ciphertext
  assert.equal(encrypted.includes(key), false)
  assert.equal((await secrets.get(alice.id)).aiKey, key)
  assert.equal((await secrets.get(bob.id)).aiKey, undefined)
  const invalid = new FormData()
  invalid.append("storage", "Local")
  invalid.append("files", new Blob(["<script>alert(1)</script>"]), "fake.pdf")
  assert.equal((await api("/documents", alice, "POST", invalid)).status, 400)
})
test("local storage rejects traversal and isolates users", async () => {
  const root = await mkdtemp(join(tmpdir(), "openfile-test-"))
  try {
    const local = new LocalStorage(root)
    await assert.rejects(
      local.put(
        "user-a",
        new Uint8Array([1]),
        "safe.txt",
        "../escape",
        "text/plain"
      )
    )
    const ref = await local.put(
      "user-a",
      new Uint8Array([65]),
      "safe.txt",
      "Documents",
      "text/plain"
    )
    assert.equal(new TextDecoder().decode(await local.read("user-a", ref)), "A")
    await assert.rejects(local.read("user-b", ref))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("PDF text extraction works with a real PDF buffer", async () => {
  const { Extractor } = await import("../src/infrastructure/intelligence")
  const content = "BT /F1 12 Tf 72 720 Td (Invoice ORCHIDEE 150 euros) Tj ET"
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  const extracted = await new Extractor().extract(
    Buffer.from(pdf),
    "application/pdf"
  )
  assert.match(extracted, /Invoice ORCHIDEE 150 euros/)
})

test("AI errors are actionable without leaking provider data", async () => {
  const { APICallError } = await import("ai")
  const { aiError } = await import("../src/infrastructure/ai-errors")
  const error = aiError(
    new APICallError({
      message: "secret-provider-details",
      url: "https://api.openai.com",
      requestBodyValues: {},
      statusCode: 401,
      responseBody: JSON.stringify({
        error: { code: "invalid_api_key", message: "sk-secret" },
      }),
    })
  )
  assert.match(error.message, /Replace it in Settings/)
  assert.equal(error.retryable, false)
  assert.equal(error.message.includes("sk-secret"), false)
})
test("analysis prepares a proposal; only confirmation moves the original", async () => {
  const { Documents } = await import("../src/application/documents")
  const { Extractor } = await import("../src/infrastructure/intelligence")
  const { AppError } = await import("../src/domain/model")
  const user = await account()
  const intelligence = {
    async analyze() {
      return {
        text: "ORCHIDEE salary certificate",
        metadata: {
          name: "Certificate_salary.pdf",
          kind: "Certificate" as const,
          issuer: "ORCHIDEE",
          date: "2026-10-01",
          folder: "Work/Salaries",
          tags: ["Work"],
          summary: "Salary certificate",
          confidence: 95,
        },
      }
    },
    async embed(): Promise<undefined> {
      throw new AppError(502, "Embeddings unavailable")
    },
    async answer() {
      return "Answer"
    },
  }
  await secrets.update(user.id, (s) => ({
    ...s,
    aiKey: "test-key",
    ai: { ...s.ai, enabled: true },
  }))
  await repository.transaction(user, async (u) => {
    u.state.settings.naming = "{type}_salary"
  })
  const service = new Documents(
    repository,
    secrets,
    storage,
    intelligence,
    new Extractor()
  )
  const id = await service.import(
    user,
    Buffer.from("ORCHIDEE salary certificate"),
    "original.txt",
    "text/plain",
    "Local"
  )
  const original = await repository.file(user.id, id)
  await service.analyze(user, id)
  const proposal = (await service.load(user)).documents.find(
    (d) => d.id === id
  )!
  assert.equal(proposal.status, "pending")
  assert.equal(proposal.processing, "ready")
  assert.equal(proposal.name, "Certificate_salary.txt")
  assert.equal(proposal.folder, "Documents/Work/Salaries")
  assert.match(proposal.processingWarning!, /Embeddings unavailable/)
  assert.deepEqual(await repository.file(user.id, id), original)
  await service.save(
    user,
    id,
    { ...proposal, name: "Certificate_salary.txt", folder: "Documents" },
    true
  )
  assert.notDeepEqual(await repository.file(user.id, id), original)
  assert.equal((await service.load(user)).documents[0]?.status, "filed")
  const answer = await service.answer(user, "Find my salary certificate")
  assert.match(answer.notice!, /Embeddings unavailable/)
  assert.equal(answer.sources[0]?.id, id)
  const filedRef = await repository.file(user.id, id)
  await repository.transaction(user, async (u) => {
    u.state.settings.naming = "{date}_{type}_{émetteur}"
  })
  await service.action(user, id, "retry")
  await service.analyze(user, id)
  const reclassified = (await service.load(user)).documents[0]!
  assert.equal(reclassified.folder, "Documents")
  assert.equal(reclassified.classification?.folder, "Documents/Work/Salaries")
  assert.equal(reclassified.classification?.name, "Certificate_salary.pdf") // Preserve the descriptive AI name, not the legacy template.
  assert.deepEqual(await repository.file(user.id, id), filedRef)
  await service.save(
    user,
    id,
    { ...reclassified, ...reclassified.classification },
    true
  )
  const confirmed = (await service.load(user)).documents[0]!
  assert.equal(confirmed.folder, "Documents/Work/Salaries")
  assert.equal(confirmed.classification, undefined)
  assert.match(
    (await repository.file(user.id, id))!.key,
    /Documents\/Work\/Salaries/
  )
  await service.cleanup(user, id, filedRef!)
  await service.cleanup(user, id, original!)
})

test("preview endpoint requires ownership even after a cache hit", async () => {
  const alice = users[0]!
  const bob = users[1]!
  const bytes = await createCanvas(1000, 500).encode("png")
  const id = await documents.import(
    alice,
    bytes,
    "image.png",
    "image/png",
    "Local"
  )
  const path = `/documents/${id}/preview`
  assert.equal((await api(path)).status, 401)
  const response = await api(path, alice)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("content-type"), "image/webp")
  assert.equal(response.headers.get("cache-control"), "no-store")
  const image = await loadImage(Buffer.from(await response.arrayBuffer()))
  assert.equal(image.width, 640)
  assert.equal(image.height, 320)
  assert.equal((await api(path, alice)).status, 200)
  assert.equal((await api(path, bob)).status, 404)
})

test("retired automations are removed without changing other workspace data", async () => {
  const user = users[1]!
  const current = await repository.load(user)
  const retainedActivity = {
    id: randomUUID(),
    title: "Collection created",
    detail: "Work",
    date: new Date().toISOString(),
  }
  const expected = {
    ...current,
    collections: [
      {
        id: "work",
        name: "Work",
        description: "Keep this",
        tag: "Work",
        color: "blue",
      },
    ],
    activities: [retainedActivity],
  }
  await pool.query("UPDATE workspaces SET state=$2 WHERE user_id=$1", [
    user.id,
    JSON.stringify({
      ...expected,
      rules: [
        {
          id: "legacy",
          name: "Ancienne règle",
          kind: "Invoice",
          destination: "Ancien",
          naming: "ancien",
          enabled: true,
        },
      ],
      activities: [
        { ...retainedActivity, id: randomUUID(), title: "Règle enregistrée" },
        retainedActivity,
        { ...retainedActivity, id: randomUUID(), title: "Règle mise à jour" },
      ],
    }),
  ])
  const others = (
    await pool.query(
      "SELECT user_id, state FROM workspaces WHERE user_id<>$1 ORDER BY user_id",
      [user.id]
    )
  ).rows
  // Recreate the pre-migration state in this isolated test database.
  await pool.query("DELETE FROM schema_migrations WHERE version=2")
  await migrate(pool)
  assert.deepEqual(await repository.load(user), expected)
  assert.deepEqual(
    (
      await pool.query(
        "SELECT user_id, state FROM workspaces WHERE user_id<>$1 ORDER BY user_id",
        [user.id]
      )
    ).rows,
    others
  )
  await migrate(pool)
  assert.deepEqual(await repository.load(user), expected)
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM workspaces WHERE state ? 'rules'"
      )
    ).rows[0].count,
    0
  )
  assert.equal(
    (await api("/rules", user, "POST", { id: "legacy" })).status,
    404
  )
  assert.equal((await api("/rules/legacy/toggle", user, "POST")).status, 404)
  assert.equal(
    Object.hasOwn(await (await api("/workspace", user)).json(), "rules"),
    false
  )
  assert.equal(
    (
      await api("/collections", user, "POST", {
        id: "other",
        name: "Personal",
        description: "",
        tag: "Personal",
        color: "blue",
      })
    ).status,
    200
  )
})

test("collections support legacy tags, multi-tag edits, validation and account isolation", async () => {
  const user = users[0]!
  const other = users[1]!
  const original = await (await api("/workspace", user)).json()
  const otherOriginal = await (await api("/workspace", other)).json()
  const legacy = {
    id: "tag-collection",
    name: "Trip",
    description: "",
    color: "blue",
    tag: "Travel",
  }
  const created = await api("/collections", user, "POST", legacy)
  assert.equal(created.status, 200)
  assert.deepEqual(
    (await created.json()).collections.find(
      (c: { id: string }) => c.id === legacy.id
    ).tags,
    ["Travel"]
  )
  const edited = await api("/collections", user, "POST", {
    ...legacy,
    tags: ["Travel", "Work", "Travel"],
  })
  assert.equal(edited.status, 200)
  const state = await edited.json()
  assert.equal(state.collections.length, original.collections.length + 1)
  assert.deepEqual(
    state.collections.find((c: { id: string }) => c.id === legacy.id).tags,
    ["Travel", "Work"]
  )
  assert.equal(
    (await api("/collections", user, "POST", { ...legacy, tags: [] })).status,
    400
  )
  assert.equal(
    (await api("/collections", user, "POST", { ...legacy, tags: [" "] }))
      .status,
    400
  )
  const removed = await api("/collections", user, "POST", {
    ...legacy,
    tags: ["Work"],
  })
  assert.equal(removed.status, 200)
  const reloaded = await (await api("/workspace", user)).json()
  assert.deepEqual(
    reloaded.collections.find((c: { id: string }) => c.id === legacy.id).tags,
    ["Work"]
  )
  assert.deepEqual(
    (await (await api("/workspace", other)).json()).collections,
    otherOriginal.collections
  )
})

test("assistant search filters, paging, scoped reads and persistent conversations", async () => {
  const { PostgresDocumentSearch } =
    await import("../src/infrastructure/document-search")
  const { PostgresConversations } =
    await import("../src/infrastructure/conversations")
  // This suite uses a disposable database; reset signup throttling for these fixtures.
  await pool.query('DELETE FROM "rateLimit"')
  const search = new PostgresDocumentSearch(pool)
  const conversations = new PostgresConversations(pool)
  const alice = await account()
  const bob = await account()
  const ids: string[] = []
  for (let i = 0; i < 3; i++) {
    const id = await documents.import(
      alice,
      Buffer.from(
        `ORCHIDEE Lease ${i}. Notice period is three months. ` +
          "Long content. ".repeat(800)
      ),
      `lease-${i}.txt`,
      "text/plain",
      "Local"
    )
    ids.push(id)
    await documents.analyze(alice, id)
    await documents.save(
      alice,
      id,
      {
        kind: "Contract",
        tags: ["Housing"],
        date: `2026-06-0${i + 1}`,
        issuer: "Owner",
        folder: "Documents/Home",
      },
      true
    )
  }
  assert.equal(await search.count(alice, "all", { folder: "Documents" }), 3)
  assert.equal(
    await search.count(alice, "all", {
      folder: "Documents",
      includeSubfolders: false,
    }),
    0
  )
  assert.equal(
    await search.count(alice, "all", {
      folder: "Documents/Home",
      includeSubfolders: false,
    }),
    3
  )
  assert.equal(await search.count(bob, "all", {}), 0)
  assert.equal(await search.count(alice, "Google Drive", {}), 0)
  assert.equal((await search.present(alice, "Local", ids)).length, 3)
  assert.deepEqual(await search.present(bob, "all", ids), [])
  assert.deepEqual(await search.present(alice, "Google Drive", ids), [])
  const page = await search.find(
    alice,
    "all",
    {
      tags: ["housing"],
      kind: "Contract",
      dateFrom: "2026-06-01",
      folder: "Documents",
    },
    0,
    2,
    "newest"
  )
  assert.equal(page.total, 3)
  assert.equal(page.documents[0]?.id, ids[2])
  assert.equal(page.nextOffset, 2)
  assert.equal(
    (await search.find(alice, "all", {}, 2, 2, "newest")).nextOffset,
    null
  )
  assert.equal(
    (await search.find(alice, "Google Drive", {}, 0, 20, "name")).total,
    0
  )
  assert.equal((await search.find(bob, "all", {}, 0, 20, "name")).total, 0)
  assert.equal(
    (
      await search.find(
        alice,
        "all",
        { issuer: "own", name: "lease-", dateTo: "2026-06-01" },
        0,
        20,
        "name"
      )
    ).total,
    1
  )
  assert.equal(
    (
      await search.find(
        alice,
        "all",
        { tags: ["Housing", "missing"] },
        0,
        20,
        "name"
      )
    ).total,
    0
  )
  const read = await search.read(alice, "Local", ids[0]!, 0, 100)
  assert.equal(read.source.excerpt.length, 100)
  assert.equal(read.nextOffset, 100)
  assert.equal(
    (await search.read(alice, "Local", ids[0]!, 100, 100)).source.start,
    100
  )
  await assert.rejects(search.read(bob, "all", ids[0]!, 0, 100), /unavailable/)
  await assert.rejects(
    search.read(alice, "Google Drive", ids[0]!, 0, 100),
    /unavailable/
  )
  const passages = await search.passages(alice, "Local", "ORCHIDEE", {
    tags: ["Housing"],
  })
  assert.equal(passages.length, 3)
  assert.equal(passages[0]?.start, 0)
  assert.deepEqual(await search.passages(bob, "all", "ORCHIDEE", {}), [])
  const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0))
  await pool.query(
    "UPDATE document_chunks SET embedding=$3::vector,model='test-embedding' WHERE user_id=$1 AND document_id=$2",
    [alice.id, ids[0], JSON.stringify(vector)]
  )
  const semantic = await search.passages(
    alice,
    "Local",
    "unmatchedquery",
    {},
    vector,
    "test-embedding",
    "semantic"
  )
  assert.ok(semantic.length > 0 && semantic.every((s) => s.id === ids[0]))
  assert.deepEqual(
    await search.passages(
      alice,
      "Local",
      "unmatchedquery",
      {},
      vector,
      "another-model",
      "semantic"
    ),
    []
  )
  assert.deepEqual(
    await search.passages(
      alice,
      "Local",
      "unmatchedquery",
      {},
      vector,
      "test-embedding",
      "text"
    ),
    []
  )
  await documents.action(alice, ids[0]!, "archive")
  assert.deepEqual(await search.present(alice, "all", [ids[0]!]), [])
  await assert.rejects(
    search.read(alice, "all", ids[0]!, 0, 100),
    /unavailable/
  )
  assert.equal((await search.versions(alice, "all", ids)).size, 2)
  assert.equal((await search.find(alice, "all", {}, 0, 20, "name")).total, 2)

  const created = await api("/conversations", alice, "POST", { scope: "Local" })
  assert.equal(created.status, 201)
  const conversation = await created.json()
  assert.equal(
    (await api(`/conversations/${conversation.id}`, bob)).status,
    404
  )
  assert.equal((await api("/conversations")).status, 401)
  const messageId = randomUUID()
  const response = await api(
    `/conversations/${conversation.id}/messages`,
    alice,
    "POST",
    { id: messageId, text: "ORCHIDEE" }
  )
  assert.equal(response.status, 200)
  const events = (await response.text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  assert.equal(events[0].type, "start")
  assert.equal(events.at(-1).type, "done")
  assert.equal(events.at(-1).message.status, "complete")
  assert.match(events.at(-1).message.text, /AI disabled/)
  assert.ok(
    events
      .at(-1)
      .message.sources.every((s: { id: string }) => ids.slice(1).includes(s.id))
  )
  const saved = await conversations.load(alice, conversation.id)
  assert.equal(saved.messages.length, 2)
  assert.equal(saved.scope, "Local")
  assert.equal(
    (
      await api(`/conversations/${conversation.id}/messages`, alice, "POST", {
        id: messageId,
        text: "ORCHIDEE",
      })
    ).status,
    409
  )
  const first = await conversations.begin(
    alice,
    conversation.id,
    randomUUID(),
    "Next"
  )
  await assert.rejects(
    conversations.begin(alice, conversation.id, randomUUID(), "Concurrent"),
    /already in progress/
  )
  await conversations.finish(alice, conversation.id, {
    ...first.messages.at(-1)!,
    status: "interrupted",
  })
  const next = await conversations.begin(
    alice,
    conversation.id,
    randomUUID(),
    "Continue"
  )
  await pool.query(
    "UPDATE conversation_messages SET created_at=now()-interval '4 minutes' WHERE conversation_id=$1 AND id=$2",
    [conversation.id, next.messages.at(-1)!.id]
  )
  assert.equal(
    (await conversations.load(alice, conversation.id)).messages.at(-1)?.status,
    "interrupted"
  )
  const recovered = await conversations.begin(
    alice,
    conversation.id,
    randomUUID(),
    "After crash"
  )
  await conversations.finish(alice, conversation.id, {
    ...recovered.messages.at(-1)!,
    status: "complete",
    text: "Recovered",
  })
  assert.equal((await conversations.list(alice))[0]?.id, conversation.id)
})

test("file deletion checks ownership, removes indexing and access, and queues storage cleanup", async () => {
  const alice = users[0]!
  const bob = users[1]!
  const id = await documents.import(
    alice,
    Buffer.from("Deletion test"),
    "delete.txt",
    "text/plain",
    "Local"
  )
  const createdAt = (await documents.load(alice)).documents[0]!.createdAt
  assert.ok(createdAt && Number.isFinite(Date.parse(createdAt)))
  assert.equal((await api(`/documents/${id}`, bob, "DELETE")).status, 404)
  assert.equal((await api(`/documents/${id}`, alice, "DELETE")).status, 409)
  await documents.analyze(alice, id)
  await documents.save(alice, id, { date: "2019-01-01" }, true)
  assert.equal((await documents.load(alice)).documents[0]!.createdAt, createdAt)
  const ref = (await repository.file(alice.id, id))!
  const response = await api(`/documents/${id}`, alice, "DELETE")
  assert.equal(response.status, 200)
  assert.equal(
    (await response.json()).documents.some((d: { id: string }) => d.id === id),
    false
  )
  assert.equal(await repository.file(alice.id, id), undefined)
  assert.equal((await api(`/documents/${id}/file`, alice)).status, 404)
  assert.equal((await api(`/documents/${id}/preview`, alice)).status, 404)
  const chunks = await pool.query(
    "SELECT id FROM document_chunks WHERE user_id=$1 AND document_id=$2",
    [alice.id, id]
  )
  assert.equal(chunks.rowCount, 0)
  const jobs = await pool.query(
    "SELECT payload FROM jobs WHERE user_id=$1 AND document_id=$2 AND kind='cleanup'",
    [alice.id, id]
  )
  assert.ok(jobs.rows.some((job) => job.payload.key === ref.key))
  for (const job of jobs.rows) await documents.cleanup(alice, id, job.payload)
  await assert.rejects(storage.get(ref.storage).read(alice.id, ref))
  assert.equal((await api(`/documents/${id}`, alice, "DELETE")).status, 404)
})
