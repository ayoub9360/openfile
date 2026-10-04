import { app } from "./http/app"
import { env } from "./config"
import { pool, secretPool } from "./bootstrap"
import { assertRuntimeRole } from "./infrastructure/database-role"
await assertRuntimeRole(pool)
const server = app.listen(env.PORT, env.HOST, () =>
  console.log(`API ready on port ${env.PORT}.`)
)
server.requestTimeout = 60000
server.headersTimeout = 15000
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      void Promise.all([pool.end(), secretPool.end()])
    })
    setTimeout(() => process.exit(0), 10000).unref()
  })
