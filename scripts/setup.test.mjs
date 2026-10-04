import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, copyFile, readFile, writeFile, stat, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
async function fixture(work) {
  const root = await mkdtemp(join(tmpdir(), "openfile-setup-test-"))
  try {
    await mkdir(join(root,"scripts"))
    await copyFile(new URL("./setup.mjs", import.meta.url), join(root,"scripts/setup.mjs"))
    const run = (...args) => spawnSync(process.execPath, [join(root,"scripts/setup.mjs"), ...args], {encoding:"utf8"})
    await work(root, run)
  } finally { await rm(root,{recursive:true,force:true}) }
}
const parse = text => Object.fromEntries(text.trim().split("\n").map(line => { const i=line.indexOf("=");return [line.slice(0,i),line.slice(i+1)] }))
test("setup creates private random credentials and preserves existing configuration", async () => fixture(async (root,run) => {
  assert.equal(run().status,0)
  const first=await readFile(join(root,".env"),"utf8")
  const env=parse(first)
  assert.match(env.SIGNUP_TOKEN,/^[a-f0-9]{64}$/)
  assert.equal(new URL(env.DATABASE_URL).username,"openfile_app")
  assert.equal(new URL(env.MIGRATION_DATABASE_URL).username,"openfile")
  assert.equal((await stat(join(root,".env"))).mode & 0o777,0o600)
  assert.equal(run().status,0)
  assert.ok(await readFile(join(root,".env"),"utf8") === first)
}))
test("upgrade preserves encryption, administrator identity and closed registration", async () => fixture(async (root,run) => {
  const original="COMPOSE_PROJECT_NAME=existing\nPOSTGRES_USER=existing\nPOSTGRES_DB=existing\nPOSTGRES_PASSWORD=fixture-only\nDATABASE_URL=postgres://existing:fixture-only@localhost:55432/existing\nBETTER_AUTH_SECRET=existing-session-secret-for-fixture\nENCRYPTION_KEY="+"a".repeat(64)+"\nSIGNUP_TOKEN=\n"
  await writeFile(join(root,".env"),original,{mode:0o600})
  assert.equal(run("--upgrade").status,0)
  const upgraded=await readFile(join(root,".env"),"utf8")
  const env=parse(upgraded),old=parse(original)
  assert.ok(env.ENCRYPTION_KEY===old.ENCRYPTION_KEY)
  assert.ok(env.BETTER_AUTH_SECRET===old.BETTER_AUTH_SECRET)
  assert.equal(env.SIGNUP_TOKEN,"")
  assert.equal(env.COMPOSE_PROJECT_NAME,"existing")
  assert.ok(env.MIGRATION_DATABASE_URL===old.DATABASE_URL)
  assert.ok(await readFile(join(root,".env.pre-security"),"utf8")===original)
  assert.equal((await stat(join(root,".env.pre-security"))).mode & 0o777,0o600)
  assert.notEqual(run("--upgrade").status,0)
  assert.ok(await readFile(join(root,".env"),"utf8")===upgraded)
}))
