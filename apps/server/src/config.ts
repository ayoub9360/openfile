import { config } from "dotenv"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"
const root = fileURLToPath(new URL("../../../", import.meta.url))
config({ path: resolve(root, ".env"), quiet: true })
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  APP_URL: z.url().default("http://localhost:3000"),
  TRUSTED_ORIGINS: z.string().default("http://localhost:3000"),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("127.0.0.1"),
  STORAGE_ROOT: z.string().default(resolve(root, ".data/files")),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  NODE_ENV: z.string().default("development"),
  SIGNUP_TOKEN: z.union([z.literal(""), z.string().min(32)]).default(""),
  MAX_USER_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1024 ** 3),
  MAX_TOTAL_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 ** 3),
  MAX_USER_DOCUMENTS: z.coerce.number().int().positive().default(500),
  MAX_USER_JOBS: z.coerce.number().int().positive().default(50),
  MAX_CONVERSATIONS: z.coerce.number().int().positive().default(100),
  MAX_CONVERSATION_MESSAGES: z.coerce.number().int().min(2).default(200),
})
export const env = schema.parse(process.env)
for (const value of [
  env.APP_URL,
  ...env.TRUSTED_ORIGINS.split(",").filter(Boolean),
]) {
  const url = new URL(value)
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error(
      "APP_URL and TRUSTED_ORIGINS must be exact HTTPS origins (HTTP is allowed only on loopback)."
    )
}
export const origins = Array.from(
  new Set([env.APP_URL, ...env.TRUSTED_ORIGINS.split(",").filter(Boolean)])
)
