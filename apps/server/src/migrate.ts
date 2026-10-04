import { Pool } from "pg"
import { getMigrations } from "better-auth/db/migration"
import { env, origins } from "./config"
import { createAuth } from "./infrastructure/auth"
export async function migrate(pool: Pool) {
  const lock = await pool.connect()
  try {
    await lock.query("SELECT pg_advisory_lock(8172321)")
    const auth = createAuth(
      pool,
      env.APP_URL,
      env.BETTER_AUTH_SECRET,
      origins,
      env.SIGNUP_TOKEN
    )
    const { runMigrations } = await getMigrations(auth.options)
    await runMigrations()
    await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE IF NOT EXISTS workspaces(user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS document_files(user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, document_id text NOT NULL, reference jsonb NOT NULL, PRIMARY KEY(user_id,document_id));
      CREATE TABLE IF NOT EXISTS user_secrets(user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,ciphertext text NOT NULL);
      CREATE TABLE IF NOT EXISTS document_chunks(id text PRIMARY KEY,user_id text NOT NULL,document_id text NOT NULL,content text NOT NULL,embedding vector(1536),model text,FOREIGN KEY(user_id,document_id) REFERENCES document_files(user_id,document_id) ON DELETE CASCADE);
      CREATE INDEX IF NOT EXISTS chunks_text ON document_chunks USING gin(to_tsvector('french',content));
      CREATE INDEX IF NOT EXISTS chunks_text_english ON document_chunks USING gin(to_tsvector('english',content));
      CREATE INDEX IF NOT EXISTS chunks_user ON document_chunks(user_id,document_id);
      CREATE TABLE IF NOT EXISTS jobs(id text PRIMARY KEY,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,document_id text NOT NULL,kind text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'queued',attempts int NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),locked_at timestamptz,error text,created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(status,available_at);
      CREATE TABLE IF NOT EXISTS oauth_states(hash text PRIMARY KEY,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,session_id text NOT NULL,verifier text NOT NULL,expires_at timestamptz NOT NULL);
      CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,applied_at timestamptz DEFAULT now());
      INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;`)
    await lock.query("BEGIN")
    try {
      const applied = await lock.query(
        "SELECT 1 FROM schema_migrations WHERE version=2"
      )
      if (!applied.rowCount) {
        // Remove retired classification rules and their demo history only.
        await lock.query(`UPDATE workspaces SET state = jsonb_set(
          state - 'rules', '{activities}',
          COALESCE((SELECT jsonb_agg(activity ORDER BY position)
            FROM jsonb_array_elements(state->'activities') WITH ORDINALITY AS entries(activity, position)
            WHERE COALESCE(activity->>'title', '') NOT IN ('Règle enregistrée', 'Règle mise à jour')), '[]'::jsonb)
          ), updated_at=now()
          WHERE state ? 'rules' OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(state->'activities') AS activity
            WHERE activity->>'title' IN ('Règle enregistrée', 'Règle mise à jour'))`)
        await lock.query("INSERT INTO schema_migrations(version) VALUES(2)")
      }
      await lock.query(`
        CREATE TABLE IF NOT EXISTS conversations(
          id text PRIMARY KEY,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
          title text NOT NULL DEFAULT 'New conversation',scope text NOT NULL CHECK(scope IN ('all','Local','Google Drive')),
          updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,id));
        CREATE INDEX IF NOT EXISTS conversations_owner ON conversations(user_id,updated_at DESC);
        CREATE TABLE IF NOT EXISTS conversation_messages(
          sequence bigserial PRIMARY KEY,conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          id text NOT NULL,body jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(conversation_id,id));
        CREATE INDEX IF NOT EXISTS conversation_message_order ON conversation_messages(conversation_id,sequence);
        ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS position integer;
        INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
      `)
      await lock.query("COMMIT")
    } catch (error) {
      await lock.query("ROLLBACK")
      throw error
    }
  } finally {
    await lock.query("SELECT pg_advisory_unlock(8172321)")
    lock.release()
  }
}
if (
  process.argv[1]?.endsWith("migrate.ts") ||
  process.argv[1]?.endsWith("migrate.js")
) {
  const pool = new Pool({ connectionString: env.DATABASE_URL })
  await migrate(pool)
  await pool.end()
  console.log("Migrations complete.")
}
