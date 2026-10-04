import { betterAuth } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { createHash, timingSafeEqual } from "node:crypto"
import type { Pool } from "pg"
export function createAuth(
  pool: Pool,
  baseURL: string,
  secret: string,
  origins: string[],
  signupToken = ""
) {
  return betterAuth({
    database: pool,
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email") {
          const digest = (s: string) => createHash("sha256").update(s).digest()
          if (
            !signupToken ||
            !timingSafeEqual(
              digest(ctx.headers?.get("x-signup-token") ?? ""),
              digest(signupToken)
            )
          )
            throw new APIError("FORBIDDEN", {
              message: "An invitation code is required to create an account.",
            })
        }
      }),
    },
    secret,
    baseURL,
    trustedOrigins: origins,
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    advanced: {
      // Express overwrites this with the socket peer, never a forwarded value.
      // Behind Next.js this intentionally shares the proxy's rate-limit bucket.
      ipAddress: { ipAddressHeaders: ["x-open-file-peer"] },
      useSecureCookies: baseURL.startsWith("https:"),
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
    },
  })
}
