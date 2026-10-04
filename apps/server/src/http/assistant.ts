import { concurrency } from "./security"
import { Router } from "express"
import { z } from "zod"
import type { Assistant } from "../application/assistant"
export function assistantRoutes(assistant: Assistant): Router {
  const router = Router()
  const turnSlot = concurrency(8, 2)
  const id = z.string().uuid()
  router.get("/", async (_req, res) => {
    res.json(await assistant.conversations.list(res.locals.user))
  })
  router.post("/", async (req, res) => {
    const { scope } = z
      .object({ scope: z.enum(["all", "Local", "Google Drive"]) })
      .strict()
      .parse(req.body)
    res
      .status(201)
      .json(await assistant.conversations.create(res.locals.user, scope))
  })
  router.get("/:id", async (req, res) => {
    res.json(
      await assistant.conversations.load(
        res.locals.user,
        id.parse(req.params.id)
      )
    )
  })
  router.delete("/:id", async (req, res) => {
    await assistant.conversations.delete(
      res.locals.user,
      id.parse(req.params.id)
    )
    res.json({ deleted: true })
  })
  router.post("/:id/messages", async (req, res) =>
    turnSlot(res.locals.user.id, async () => {
      const body = z
        .object({
          id: z.string().regex(/^[a-f0-9-]{32,36}$/i),
          text: z.string().trim().min(1).max(8000),
        })
        .strict()
        .parse(req.body)
      const conversation = await assistant.prepare(
        res.locals.user,
        id.parse(req.params.id),
        body.id,
        body.text
      )
      const controller = new AbortController()
      const abort = () => {
        if (!res.writableEnded) controller.abort()
      }
      res.on("close", abort)
      const timeout = setTimeout(() => controller.abort(), 120000)
      res.status(200).set({
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      })
      res.flushHeaders()
      // Keep proxies alive while the model or a tool is working.
      const heartbeat = setInterval(() => {
        if (!res.destroyed) res.write("\n")
      }, 15000)
      try {
        await assistant.run(
          res.locals.user,
          conversation,
          controller.signal,
          (event) => {
            if (!res.destroyed) res.write(JSON.stringify(event) + "\n")
          }
        )
      } finally {
        clearTimeout(timeout)
        clearInterval(heartbeat)
        res.off("close", abort)
        res.end()
      }
    })
  )
  return router
}
