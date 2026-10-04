import { authBoundary, concurrency } from "./security"
import { assistantRoutes } from "./assistant"
import express from "express"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import multer from "multer"
import { fileTypeFromBuffer } from "file-type"
import { randomBytes, createHash, randomUUID } from "node:crypto"
import { toNodeHandler, fromNodeHeaders } from "better-auth/node"
import { z } from "zod"
import {
  auth,
  pool,
  documents,
  repository,
  secrets,
  drive,
  previews,
  assistant,
} from "../bootstrap"
import { env, origins } from "../config"
import { AppError, safeFolder, safeSegment, type User } from "../domain/model"
const kind = z.enum([
  "Invoice",
  "Contract",
  "Certificate",
  "Statement",
  "Document",
])
const editable = z.object({
  name: z.string().min(1).max(180),
  kind,
  issuer: z.string().max(300),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().optional(),
  storage: z.enum(["Local", "Google Drive"]),
  folder: z.string().max(1000),
  tags: z.array(z.string().max(80)).max(20),
  revision: z.number().int().positive().optional(),
})
const idSchema = z.string().min(1).max(100)
export const app: express.Express = express()
app.disable("x-powered-by")
app.set("trust proxy", false)
app.use(helmet({ contentSecurityPolicy: false }))
app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1")
  res.json({ status: "ok" })
})
app.all("/api/auth/*splat", authBoundary(env.SIGNUP_TOKEN), toNodeHandler(auth))
app.use(express.json({ limit: "100kb" }))
app.use("/api", async (req, res, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  if (!session) throw new AppError(401, "Sign in to access your workspace.")
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    (!req.headers.origin || !origins.includes(req.headers.origin))
  )
    throw new AppError(403, "Origin not allowed.")
  res.locals.user = session.user
  res.locals.sessionId = session.session.id
  res.setHeader("Cache-Control", "no-store")
  next()
})
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 180,
    keyGenerator: (_req, res) => res.locals.user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  })
)
app.use("/api/conversations", assistantRoutes(assistant))
app.get("/api/workspace", async (_req, res) => {
  res.json(await documents.load(res.locals.user))
})
const fileSlot = concurrency(6, 2)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 5, fields: 1 },
})
const importSlot = concurrency(2, 1)
app.post("/api/documents", async (req, res) =>
  importSlot(res.locals.user.id, async () => {
    await new Promise<void>((resolve, reject) =>
      upload.array("files", 5)(req, res, (error) =>
        error ? reject(error) : resolve()
      )
    )
    const target = z.enum(["Local", "Google Drive"]).parse(req.body.storage)
    const files = req.files as Express.Multer.File[]
    if (!files?.length) throw new AppError(400, "Choose a file.")
    // Validate the whole batch before storing the first file.
    const accepted = await Promise.all(
      files.map(async (f) => {
        const name = Buffer.from(f.originalname, "latin1").toString("utf8")
        safeSegment(name)
        const detected = await fileTypeFromBuffer(f.buffer)
        const mime =
          detected?.mime ??
          (/\.txt$/i.test(name) && !f.buffer.includes(0) ? "text/plain" : "")
        if (
          ![
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
            "text/plain",
          ].includes(mime)
        )
          throw new AppError(
            400,
            "Accepted formats: PDF, PNG, JPEG, WebP, and UTF-8 text."
          )
        return { ...f, name, mime }
      })
    )
    const errors: string[] = []
    const documentIds: string[] = []
    for (const f of accepted) {
      try {
        documentIds.push(
          await documents.import(
            res.locals.user,
            f.buffer,
            f.name,
            f.mime,
            target
          )
        )
      } catch (e) {
        errors.push(
          `${f.name} : ${e instanceof AppError ? e.message : "Import failed"}`
        )
      }
    }
    res.json({
      state: await documents.load(res.locals.user),
      documentIds,
      errors,
    })
  })
)
app.put("/api/documents/:id", async (req, res) => {
  const body = z
    .object({ document: editable, approve: z.boolean().default(false) })
    .parse(req.body)
  res.json(
    await documents.save(
      res.locals.user,
      idSchema.parse(req.params.id),
      body.document,
      body.approve
    )
  )
})
app.delete("/api/documents/:id", async (req, res) => {
  res.json(
    await documents.delete(res.locals.user, idSchema.parse(req.params.id))
  )
})
app.post("/api/documents/approve", async (req, res) => {
  const ids = z.array(idSchema).min(1).max(50).parse(req.body.ids)
  // Validate ownership of every selected document before acting.
  const state = await documents.load(res.locals.user)
  if (ids.some((id) => !state.documents.some((d) => d.id === id)))
    throw new AppError(404, "Document not found.")
  for (const id of ids) await documents.save(res.locals.user, id, {}, true)
  res.json(await documents.load(res.locals.user))
})
app.post("/api/documents/:id/:action", async (req, res) => {
  res.json(
    await documents.action(
      res.locals.user,
      idSchema.parse(req.params.id),
      z.enum(["archive", "favorite", "retry"]).parse(req.params.action)
    )
  )
})
app.get("/api/documents/:id/file", async (req, res) =>
  fileSlot(res.locals.user.id, async () => {
    const { data, ref } = await documents.file(
      res.locals.user,
      idSchema.parse(req.params.id)
    )
    if (res.destroyed) return
    await new Promise<void>((resolve) => {
      const done = () => {
        res.off("finish", done)
        res.off("close", done)
        resolve()
      }
      res.once("finish", done)
      res.once("close", done)
      res.setTimeout(30000, () => res.destroy())
      res
        .type(ref.mimeType)
        .set("Content-Disposition", "inline")
        .send(Buffer.from(data))
    })
  })
)
app.get("/api/documents/:id/preview", async (req, res) => {
  const data = await previews.get(
    res.locals.user,
    idSchema.parse(req.params.id)
  )
  res.type("image/webp").send(Buffer.from(data))
})
const answerSlot = concurrency(4, 1)
app.post("/api/search/answer", async (req, res) =>
  answerSlot(res.locals.user.id, async () => {
    const body = z
      .object({
        question: z.string().trim().min(1).max(2000),
        ids: z.array(idSchema).max(100).optional(),
      })
      .parse(req.body)
    res.json(await documents.answer(res.locals.user, body.question, body.ids))
  })
)
app.post("/api/collections", async (req, res) => {
  const collection = z
    .object({
      id: idSchema,
      name: z.string().trim().min(1).max(150),
      description: z.string().max(1000),
      tag: z.string().trim().min(1).max(80).optional(),
      tags: z.array(z.string().trim().min(1).max(80)).min(1).max(20).optional(),
      color: z.enum(["sage", "peach", "blue", "lavender", "yellow"]),
    })
    .refine((value) => value.tags !== undefined || value.tag !== undefined, {
      message: "Choose at least one tag.",
    })
    .transform(({ tag, tags, ...value }) => ({
      ...value,
      tags: [...new Set(tags ?? [tag!])],
    }))
    .parse(req.body)
  await repository.transaction(res.locals.user, async (u) => {
    if (
      u.state.collections.length >= 100 &&
      !u.state.collections.some((c) => c.id === collection.id)
    )
      throw new AppError(
        413,
        "Collection limit reached. Edit an existing collection instead."
      )
    u.state.collections = [
      ...u.state.collections.filter((c) => c.id !== collection.id),
      collection,
    ]
  })
  res.json(await documents.load(res.locals.user))
})
app.put("/api/settings", async (req, res) => {
  const settings = z
    .object({
      name: z.string().trim().min(1).max(100),
      email: z.email(),
      naming: z.string().max(180),
      review: z.boolean(),
      notifications: z.boolean(),
    })
    .parse(req.body)
  await auth.api.updateUser({
    headers: fromNodeHeaders(req.headers),
    body: { name: settings.name },
  })
  await repository.transaction(res.locals.user, async (u) => {
    u.state.settings = {
      ...settings,
      email: res.locals.user.email,
      review: true,
      notifications: false,
    }
  })
  res.json(await documents.load(res.locals.user))
})
async function integrations(user: User) {
  const s = await secrets.get(user.id)
  return {
    ai: { ...s.ai, hasApiKey: !!s.aiKey },
    connectors: {
      localFolder: s.localFolder,
      driveFolder: s.driveFolder,
      googleConfigured: !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
      driveConnected: !!s.driveRefreshToken,
    },
  }
}
app.get("/api/integrations", async (_req, res) => {
  res.json(await integrations(res.locals.user))
})
app.put("/api/integrations", async (req, res) => {
  const input = z
    .object({
      ai: z
        .object({
          provider: z.literal("openai"),
          model: z
            .string()
            .regex(/^[a-zA-Z0-9._:-]+$/)
            .max(100),
          embeddingModel: z.enum([
            "text-embedding-3-small",
            "text-embedding-3-large",
          ]),
          enabled: z.boolean(),
          apiKey: z.string().min(10).max(1000).optional(),
          removeKey: z.boolean().optional(),
        })
        .optional(),
      localFolder: z.string().max(1000).optional(),
      driveFolder: z.string().max(180).optional(),
    })
    .parse(req.body)
  if (input.localFolder) safeFolder(input.localFolder)
  if (input.driveFolder) safeSegment(input.driveFolder)
  await secrets.update(res.locals.user.id, (s) => {
    if (input.ai) {
      const { apiKey, removeKey, ...ai } = input.ai
      s.ai = ai
      if (apiKey) s.aiKey = apiKey
      if (removeKey) {
        delete s.aiKey
        s.ai.enabled = false
      }
      if (s.ai.enabled && !s.aiKey)
        throw new AppError(400, "Add an OpenAI key to enable AI.")
    }
    if (input.localFolder) s.localFolder = input.localFolder
    if (input.driveFolder && input.driveFolder !== s.driveFolder) {
      s.driveFolder = input.driveFolder
      delete s.driveRootId
    }
    return s
  })
  res.json(await integrations(res.locals.user))
})
const hash = (value: string) =>
  createHash("sha256").update(value).digest("base64url")
const callback = `${env.APP_URL}/api/connectors/drive/callback`
app.post("/api/connectors/drive/authorize", async (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
    throw new AppError(
      412,
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server."
    )
  const state = randomBytes(32).toString("base64url")
  const verifier = randomBytes(32).toString("base64url")
  await pool.query("DELETE FROM oauth_states WHERE expires_at<now()")
  await pool.query(
    "INSERT INTO oauth_states(hash,user_id,session_id,verifier,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
    [hash(state), res.locals.user.id, res.locals.sessionId, verifier]
  )
  res.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callback, response_type: "code", scope: "https://www.googleapis.com/auth/drive.file", access_type: "offline", prompt: "consent", state, code_challenge: hash(verifier), code_challenge_method: "S256" })}`,
  })
})
app.get("/api/connectors/drive/callback", async (req, res) => {
  if (req.query.error) {
    res.redirect(`${env.APP_URL}/connectors?drive=cancelled`)
    return
  }
  const state = z.string().max(200).parse(req.query.state)
  const code = z.string().max(2000).parse(req.query.code)
  const result = await pool.query(
    "DELETE FROM oauth_states WHERE hash=$1 AND user_id=$2 AND session_id=$3 AND expires_at>now() RETURNING verifier",
    [hash(state), res.locals.user.id, res.locals.sessionId]
  )
  if (!result.rows[0])
    throw new AppError(400, "Authorization expired. Reconnect Google Drive.")
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: result.rows[0].verifier,
      redirect_uri: callback,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new AppError(502, "Google authorization denied.")
  const token = (await response.json()) as { refresh_token?: string }
  if (!token.refresh_token)
    throw new AppError(
      400,
      "Google did not grant offline access. Reconnect the account."
    )
  await secrets.update(res.locals.user.id, (s) => ({
    ...s,
    driveRefreshToken: token.refresh_token,
  }))
  res.redirect(`${env.APP_URL}/connectors?drive=connected`)
})
app.post("/api/connectors/:id/test", async (req, res) => {
  if (req.params.id === "drive") await drive.token(res.locals.user.id)
  else if (req.params.id !== "local")
    throw new AppError(404, "Connector not found.")
  res.json(await documents.load(res.locals.user))
})
app.post("/api/connectors/drive/disconnect", async (_req, res) => {
  await secrets.update(res.locals.user.id, (s) => {
    delete s.driveRefreshToken
    return s
  })
  res.json(await documents.load(res.locals.user))
})
app.use("/api", (_req, _res) => {
  throw new AppError(404, "Resource not found.")
})
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (res.headersSent) {
      res.end()
      return
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: "Invalid data.",
        details: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      })
      return
    }
    if (error instanceof multer.MulterError) {
      res
        .status(400)
        .json({ error: "Imports are limited to 5 files of 20 MB each." })
      return
    }
    if (error instanceof AppError) {
      res.status(error.status).json({ error: error.message })
      return
    }
    const incident = randomUUID()
    console.error(
      `API error ${incident}`,
      error instanceof Error ? error.name : "Unknown"
    )
    res.status(500).json({ error: `An error occurred (${incident}).` })
  }
)
