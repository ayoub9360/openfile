import { Pool } from "pg"
import { env, origins } from "./config"
import { createAuth } from "./infrastructure/auth"
import { PostgresRepository } from "./infrastructure/database"
import { EncryptedSecrets } from "./infrastructure/secrets"
import { DriveStorage, LocalStorage, Storages } from "./infrastructure/storage"
import { Extractor, OpenAIIntelligence } from "./infrastructure/intelligence"
import { Documents } from "./application/documents"
import { Previews } from "./application/previews"
import { renderPreview } from "./infrastructure/preview-renderer"
export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 })
export const auth = createAuth(
  pool,
  env.APP_URL,
  env.BETTER_AUTH_SECRET,
  origins,
  env.SIGNUP_TOKEN
)
export const repository = new PostgresRepository(pool)
export const secretPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
})
export const secrets = new EncryptedSecrets(
  secretPool,
  Buffer.from(env.ENCRYPTION_KEY, "hex")
)
export const drive = new DriveStorage(
  secrets,
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET
)
export const storage = new Storages(new LocalStorage(env.STORAGE_ROOT), drive)
export const previews = new Previews(repository, storage, renderPreview)
export const documents = new Documents(
  repository,
  secrets,
  storage,
  new OpenAIIntelligence(secrets),
  new Extractor()
)

import { Assistant } from "./application/assistant"
import { PostgresConversations } from "./infrastructure/conversations"
import { PostgresDocumentSearch } from "./infrastructure/document-search"
import { SdkAssistantRuntime } from "./infrastructure/assistant-agent"
export const assistant = new Assistant(
  new PostgresConversations(pool),
  new PostgresDocumentSearch(pool),
  new OpenAIIntelligence(secrets),
  secrets,
  new SdkAssistantRuntime(secrets)
)
