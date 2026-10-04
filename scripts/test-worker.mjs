// End-to-end durability check against the local Compose stack.
import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import assert from "node:assert/strict"
const require = createRequire(
  new URL("../apps/server/package.json", import.meta.url)
)
require("dotenv").config({
  path: new URL("../.env", import.meta.url),
  quiet: true,
})
const { Pool } = require("pg")
const db = new Pool({ connectionString: process.env.DATABASE_URL })
const base = "http://localhost:3000"
let userId
let cookie
async function docker(...args) {
  const child = spawn("docker", ["compose", ...args], {
    cwd: new URL("../", import.meta.url),
    stdio: "ignore",
  })
  const code = await new Promise((r) => child.on("exit", r))
  if (code !== 0) throw new Error("Docker command failed.")
}
async function api(path, method = "GET", body) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: base,
      ...(path === "/auth/sign-up/email"
        ? { "x-signup-token": process.env.SIGNUP_TOKEN ?? "" }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(body
      ? { body: body instanceof FormData ? body : JSON.stringify(body) }
      : {}),
  })
  assert.equal(r.status, 200)
  return r
}
try {
  const signup = await api("/auth/sign-up/email", "POST", {
    name: "Worker recovery test",
    email: `worker-${randomUUID()}@openfile-test.invalid`,
    password: randomUUID(),
  })
  userId = (await signup.json()).user.id
  cookie = signup.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ")
  await docker("stop", "worker")
  const form = new FormData()
  form.append("storage", "Local")
  form.append(
    "files",
    new Blob(["Document for verifying persistent worker recovery."]),
    "reprise.txt"
  )
  const uploaded = await (await api("/documents", "POST", form)).json()
  assert.deepEqual(uploaded.errors, [])
  const id = uploaded.state.documents[0].id
  assert.equal(uploaded.state.documents[0].processing, "queued")
  await docker("restart", "backend")
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  assert.equal(
    (await (await api("/workspace")).json()).documents[0].processing,
    "queued"
  )
  await docker("start", "worker")
  let status
  for (let i = 0; i < 30; i++) {
    const state = await (await api("/workspace")).json()
    status = state.documents[0].processing
    if (status === "ready") break
    await new Promise((r) => setTimeout(r, 1000))
  }
  assert.equal(status, "ready")
  const jobs = await db.query(
    "SELECT status FROM jobs WHERE user_id=$1 AND document_id=$2",
    [userId, id]
  )
  assert.equal(jobs.rows[0].status, "done")
  console.log(
    "Recovery verified: upload without worker, API restart, worker restart, analysis complete."
  )
} finally {
  await docker("start", "worker")
  if (userId && /^[a-zA-Z0-9-]+$/.test(userId)) {
    await docker(
      "exec",
      "-T",
      "backend",
      "node",
      "--input-type=module",
      "-e",
      'import {rm} from "node:fs/promises"; import {join} from "node:path"; await rm(join(process.env.STORAGE_ROOT,process.argv[1]),{recursive:true,force:true})',
      userId
    )
    await db.query('DELETE FROM "user" WHERE id=$1', [userId])
  }
  await db.end()
}
