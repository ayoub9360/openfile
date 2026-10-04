import { Pool } from "pg"
import { env } from "./config"
import { migrate } from "./migrate"

// Only the one-shot migration service receives administrator credentials.
const password = process.env.APP_DATABASE_PASSWORD
if (!password || !/^[a-f0-9]{64}$/.test(password))
  throw new Error(
    "APP_DATABASE_PASSWORD must be 32 random bytes encoded as hex. Run setup."
  )
const pool = new Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL,
})
try {
  await migrate(pool)
  const db = await pool.connect()
  try {
    await db.query("BEGIN")
    await db.query("SELECT pg_advisory_xact_lock(8172323)")
    const role = await db.query(
      "SELECT 1 FROM pg_roles WHERE rolname='openfile_app'"
    )
    if (!role.rowCount) await db.query("CREATE ROLE openfile_app LOGIN")
    // The value is strictly hex-validated and never logged.
    await db.query(
      `ALTER ROLE openfile_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`
    )
    await db.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
    await db.query("GRANT USAGE ON SCHEMA public TO openfile_app")
    await db.query(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO openfile_app"
    )
    await db.query(
      "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO openfile_app"
    )
    await db.query("ALTER ROLE openfile_app SET statement_timeout='30s'")
    await db.query(
      "ALTER ROLE openfile_app SET idle_in_transaction_session_timeout='120s'"
    )
    await db.query("COMMIT")
  } catch (error) {
    await db.query("ROLLBACK")
    throw error
  } finally {
    db.release()
  }
  console.log("Migrations complete; restricted application role ready.")
} finally {
  await pool.end()
}
