import { createHash, timingSafeEqual } from "node:crypto"
import type { RequestHandler } from "express"
import { AppError } from "../domain/model"

export function authBoundary(signupToken: string): RequestHandler {
  return (req, _res, next) => {
    req.headers["x-open-file-peer"] = req.socket.remoteAddress ?? "127.0.0.1"
    // Match Better Auth's normalized endpoint, including a trailing slash.
    const path = new URL(req.originalUrl, "http://localhost").pathname.replace(
      /\/+$/,
      ""
    )
    if (path === "/api/auth/sign-up/email") {
      const supplied = req.get("x-signup-token") ?? ""
      const digest = (s: string) => createHash("sha256").update(s).digest()
      if (
        !signupToken ||
        !timingSafeEqual(digest(supplied), digest(signupToken))
      )
        throw new AppError(
          403,
          "An invitation code is required to create an account."
        )
    }
    next()
  }
}

// A slot is released when the handler has really finished, not merely when a
// client disconnects (which could otherwise bypass concurrency limits).
export function concurrency(globalLimit: number, userLimit: number) {
  let active = 0
  const users = new Map<string, number>()
  return async <T>(user: string, work: () => Promise<T>): Promise<T> => {
    const count = users.get(user) ?? 0
    if (active >= globalLimit || count >= userLimit)
      throw new AppError(
        429,
        "Too many operations in progress. Try again shortly."
      )
    active++
    users.set(user, count + 1)
    try {
      return await work()
    } finally {
      active--
      const remaining = (users.get(user) ?? 1) - 1
      if (remaining) users.set(user, remaining)
      else users.delete(user)
    }
  }
}
