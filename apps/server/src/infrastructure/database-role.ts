import type { Pool } from "pg"
export async function assertRuntimeRole(pool: Pool) {
  const { rows } = await pool.query(
    "SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user"
  )
  if (!rows[0] || Object.values(rows[0]).some(Boolean))
    throw new Error(
      "The application database role is overprivileged. Run the migration service and use openfile_app."
    )
}
