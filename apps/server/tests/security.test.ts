import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { app } from "../src/http/app"
import {
  pool,
  secretPool,
  repository,
  documents,
  storage,
  assistant,
} from "../src/bootstrap"
import { env } from "../src/config"
import { migrate } from "../src/migrate"
import { concurrency } from "../src/http/security"
import { parseIsolated } from "../src/infrastructure/parser-process"
import { assertRuntimeRole } from "../src/infrastructure/database-role"
import type { User } from "../src/domain/model"
let server: Server
let base: string
const users: User[] = []
before(async () => {
  await migrate(pool)
  server = app.listen(0, "127.0.0.1")
  await new Promise<void>((resolve) => server.once("listening", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(async () => {
  for (const user of users) {
    const files = await pool.query(
      "SELECT reference FROM document_files WHERE user_id=$1 UNION ALL SELECT payload AS reference FROM jobs WHERE user_id=$1 AND kind='cleanup'",
      [user.id]
    )
    for (const { reference } of files.rows)
      await storage.get(reference.storage).remove(user.id, reference)
    await pool.query('DELETE FROM "user" WHERE id=$1', [user.id])
  }
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await Promise.all([pool.end(), secretPool.end()])
})
async function account() {
  const user = {
    id: randomUUID(),
    email: `${randomUUID()}@example.invalid`,
    name: "Security test",
  }
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now())',
    [user.id, user.name, user.email]
  )
  users.push(user)
  return user
}
test("signup requires an invitation, including normalized paths", async () => {
  for (const path of ["/api/auth/sign-up/email", "/api/auth/sign-up/email/"]) {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { Origin: env.APP_URL, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "No invitation",
        email: `${randomUUID()}@example.invalid`,
        password: randomUUID(),
      }),
    })
    assert.ok([403, 404].includes(response.status))
  }
})
test("spoofing forwarded and internal IP headers cannot reset authentication throttling", async () => {
  const statuses: number[] = []
  for (let i = 1; i <= 5; i++) {
    const response = await fetch(base + "/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        Origin: env.APP_URL,
        "Content-Type": "application/json",
        "X-Forwarded-For": `198.51.100.${i}`,
        "X-Open-File-Peer": `203.0.113.${i}`,
      },
      body: JSON.stringify({
        email: `${randomUUID()}@example.invalid`,
        password: randomUUID(),
      }),
    })
    statuses.push(response.status)
  }
  assert.deepEqual(statuses, [401, 401, 401, 429, 429])
})
test("concurrent imports cannot exceed the quota; queued cleanup still counts", async () => {
  const user = await account()
  const previous = env.MAX_USER_BYTES
  env.MAX_USER_BYTES = 30
  try {
    const results = await Promise.allSettled(
      [1, 2].map((i) =>
        documents.import(
          user,
          Buffer.from("x".repeat(20)),
          `${i}.txt`,
          "text/plain",
          "Local"
        )
      )
    )
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1)
    const state = await repository.load(user)
    assert.equal(state.documents.length, 1)
    const id = state.documents[0]!.id
    await repository.transaction(user, async (u) => {
      u.state.documents[0]!.processing = "ready"
    })
    await documents.delete(user, id)
    await assert.rejects(
      documents.import(
        user,
        Buffer.from("x".repeat(20)),
        "3.txt",
        "text/plain",
        "Local"
      ),
      /quota/
    )
  } finally {
    env.MAX_USER_BYTES = previous
  }
})
test("document deletion purges derived conversations and prevents a late response from restoring them", async () => {
  const user = await account()
  const other = await account()
  const id = await documents.import(
    user,
    Buffer.from("Private fixture"),
    "private.txt",
    "text/plain",
    "Local"
  )
  await repository.transaction(user, async (u) => {
    u.state.documents[0]!.processing = "ready"
  })
  const conversation = await assistant.conversations.create(user, "all")
  const pending = await assistant.conversations.begin(
    user,
    conversation.id,
    randomUUID(),
    "Read my document"
  )
  const message = pending.messages.at(-1)!
  message.text = "Private fixture"
  message.sources = [
    {
      id,
      name: "private.txt",
      excerpt: "Private fixture",
      reference: "S1",
      version: "v1",
    },
  ]
  message.status = "complete"
  await assistant.conversations.finish(user, conversation.id, message)
  const running = await assistant.conversations.begin(
    user,
    conversation.id,
    randomUUID(),
    "Continue"
  )
  await assert.rejects(
    assistant.conversations.delete(other, conversation.id),
    /not found/
  )
  await documents.delete(user, id)
  const late = running.messages.at(-1)!
  late.text = "Private fixture"
  late.status = "complete"
  await assistant.conversations.finish(user, conversation.id, late)
  assert.equal(late.text, "")
  assert.equal(late.status, "interrupted")
  await assert.rejects(
    assistant.conversations.load(user, conversation.id),
    /not found/
  )
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM conversation_messages WHERE conversation_id=$1",
        [conversation.id]
      )
    ).rows[0].count,
    0
  )
})
test("conversation and message quotas fail closed and deletion frees capacity", async () => {
  const user = await account()
  const count = env.MAX_CONVERSATIONS,
    messages = env.MAX_CONVERSATION_MESSAGES
  env.MAX_CONVERSATIONS = 1
  env.MAX_CONVERSATION_MESSAGES = 2
  try {
    const c = await assistant.conversations.create(user, "all")
    await assert.rejects(assistant.conversations.create(user, "all"), /limit/)
    await assistant.conversations.begin(user, c.id, randomUUID(), "First")
    await assert.rejects(
      assistant.conversations.begin(user, c.id, randomUUID(), "Second"),
      /full/
    )
    await assistant.conversations.delete(user, c.id)
    assert.ok(await assistant.conversations.create(user, "all"))
  } finally {
    env.MAX_CONVERSATIONS = count
    env.MAX_CONVERSATION_MESSAGES = messages
  }
})
test("resource slots reject overlap and recover after failure", async () => {
  const slot = concurrency(2, 1)
  let release!: () => void
  const pending = slot(
    "alice",
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
  )
  await assert.rejects(
    slot("alice", async () => {}),
    /operations/
  )
  await slot("bob", async () => {})
  release()
  await pending
  await assert.rejects(
    slot("alice", async () => {
      throw new Error("fixture")
    }),
    /fixture/
  )
  await slot("alice", async () => {})
})
test("decoder deadline kills a stuck process and subsequent requests remain usable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openfile-parser-test-"))
  try {
    const entry = join(directory, "stuck.mjs")
    await writeFile(entry, 'process.on("message", () => { while (true) {} })')
    const start = Date.now()
    await assert.rejects(
      parseIsolated("text", Buffer.from("fixture"), "application/pdf", {
        entry,
        timeoutMs: 1000,
      }),
      /safety limits/
    )
    assert.ok(Date.now() - start < 5000)
    await assert.rejects(
      parseIsolated("preview", Buffer.from("invalid"), "image/png"),
      /safety limits/
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
test("runtime rejects the privileged test administrator", async () => {
  await assert.rejects(assertRuntimeRole(pool), /overprivileged/)
})
