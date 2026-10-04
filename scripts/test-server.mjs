import { createRequire } from "node:module"
import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
const require = createRequire(
  new URL("../apps/server/package.json", import.meta.url)
)
require("dotenv").config({
  path: new URL("../.env", import.meta.url),
  quiet: true,
})
const { Pool } = require("pg")
const adminUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
const admin = new Pool({ connectionString: adminUrl })
const name = `openfile_test_${randomBytes(8).toString("hex")}`
const directory = await mkdtemp(join(tmpdir(), "openfile-tests-"))
try {
  await admin.query(`CREATE DATABASE "${name}"`)
  const url = new URL(adminUrl)
  url.pathname = "/" + name
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "tests/integration.test.ts",
      "tests/previews.test.ts",
      "tests/assistant.test.ts",
      "tests/security.test.ts",
    ],
    {
      cwd: new URL("../apps/server", import.meta.url),
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        APP_URL: "http://localhost:3000",
        TRUSTED_ORIGINS: "http://localhost:3000",
        SIGNUP_TOKEN: randomBytes(32).toString("hex"),
        STORAGE_ROOT: directory,
      },
      stdio: "inherit",
    }
  )
  process.exitCode = await new Promise((resolve) =>
    child.on("exit", (code) => resolve(code ?? 1))
  )
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  await admin.end()
  await rm(directory, { recursive: true, force: true })
}
