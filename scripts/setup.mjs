import { randomBytes } from "node:crypto"
import { readFile, writeFile, rename } from "node:fs/promises"
const path = new URL("../.env", import.meta.url)
const secret = () => randomBytes(32).toString("hex")
let existing
try {
  existing = await readFile(path, "utf8")
} catch (error) {
  if (error.code !== "ENOENT") throw error
}
if (existing !== undefined && !process.argv.includes("--upgrade")) {
  console.log(
    ".env kept unchanged. Use --upgrade to prepare the restricted database role and invitation code."
  )
} else {
  const values = Object.fromEntries(
    (existing ?? "")
      .split("\n")
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const i = line.indexOf("=")
        return [line.slice(0, i), line.slice(i + 1)]
      })
  )
  const adminPassword = values.POSTGRES_PASSWORD || secret()
  const appPassword = values.APP_DATABASE_PASSWORD || secret()
  const adminUrl =
    values.MIGRATION_DATABASE_URL ||
    values.DATABASE_URL ||
    `postgres://openfile:${adminPassword}@127.0.0.1:55432/openfile`
  const appUrl = new URL(adminUrl)
  appUrl.username = "openfile_app"
  appUrl.password = appPassword
  const updates = {
    POSTGRES_PASSWORD: adminPassword,
    MIGRATION_DATABASE_URL: adminUrl,
    APP_DATABASE_PASSWORD: appPassword,
    DATABASE_URL: appUrl.toString(),
    BETTER_AUTH_SECRET: values.BETTER_AUTH_SECRET || secret(),
    ENCRYPTION_KEY: values.ENCRYPTION_KEY || secret(),
    SIGNUP_TOKEN: values.SIGNUP_TOKEN ?? secret(),
    APP_URL: values.APP_URL || "http://localhost:3000",
    TRUSTED_ORIGINS: values.TRUSTED_ORIGINS || "http://localhost:3000",
    GOOGLE_CLIENT_ID: values.GOOGLE_CLIENT_ID || "",
    GOOGLE_CLIENT_SECRET: values.GOOGLE_CLIENT_SECRET || "",
  }
  const used = new Set()
  const lines = (existing ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const key = line.split("=", 1)[0]
      if (!(key in updates)) return line
      used.add(key)
      return `${key}=${updates[key]}`
    })
  for (const [key, value] of Object.entries(updates))
    if (!used.has(key)) lines.push(`${key}=${value}`)
  if (existing !== undefined)
    await writeFile(
      new URL("../.env.pre-security", import.meta.url),
      existing,
      { flag: "wx", mode: 0o600 }
    )
  const temporary = new URL(
    `../.env.setup-${randomBytes(8).toString("hex")}`,
    import.meta.url
  )
  await writeFile(temporary, lines.join("\n") + "\n", {
    flag: "wx",
    mode: 0o600,
  })
  if (existing === undefined) {
    try {
      await writeFile(path, lines.join("\n") + "\n", {
        flag: "wx",
        mode: 0o600,
      })
    } finally {
      await (await import("node:fs/promises")).unlink(temporary)
    }
  } else {
    if ((await readFile(path, "utf8")) !== existing)
      throw new Error(".env changed during setup; refusing to overwrite it.")
    await rename(temporary, path)
  }
  console.log(
    ".env prepared. Run the migration service before starting the application. Read SIGNUP_TOKEN privately for invitations; clear it to close registration. Keep a secure backup of ENCRYPTION_KEY."
  )
}
