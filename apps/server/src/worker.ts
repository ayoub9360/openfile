import { pool, secretPool, documents } from "./bootstrap"
import { AppError } from "./domain/model"
import { assertRuntimeRole } from "./infrastructure/database-role"
await assertRuntimeRole(pool)
let lastPrune = 0
let stopping = false
process.on("SIGTERM", () => {
  stopping = true
})
process.on("SIGINT", () => {
  stopping = true
})
console.log("Worker ready.")
while (!stopping) {
  if (Date.now() - lastPrune > 3600000) {
    await pool.query(
      "DELETE FROM jobs WHERE status='done' AND created_at<now()-interval '7 days'"
    )
    lastPrune = Date.now()
  }
  // Jobs are leased; a crashed process can be replaced without losing the queue.
  const { rows } = await pool.query(
    `UPDATE jobs SET status='running', attempts=attempts+1,locked_at=now() WHERE id=(SELECT id FROM jobs WHERE (status='queued' AND available_at<=now()) OR (status='running' AND locked_at<now()-interval '5 minutes') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`
  )
  const job = rows[0]
  if (!job) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    continue
  }
  const heartbeat = setInterval(() => {
    void pool
      .query(
        "UPDATE jobs SET locked_at=now() WHERE id=$1 AND attempts=$2 AND status='running'",
        [job.id, job.attempts]
      )
      .catch(() => {})
  }, 30000)
  try {
    const result = await pool.query(
      'SELECT id,name,email FROM "user" WHERE id=$1',
      [job.user_id]
    )
    const user = result.rows[0]
    if (user) {
      if (job.kind === "analyze") await documents.analyze(user, job.document_id)
      else await documents.cleanup(user, job.document_id, job.payload)
    }
    await pool.query(
      "UPDATE jobs SET status='done',error=NULL WHERE id=$1 AND attempts=$2",
      [job.id, job.attempts]
    )
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "File processing failed. Check the file and its destination, then try again."
    const retry =
      job.attempts < 3 && (!(error instanceof AppError) || error.retryable)
    await pool.query(
      "UPDATE jobs SET status=$2,error=$4,available_at=now()+interval '30 seconds' WHERE id=$1 AND attempts=$3",
      [job.id, retry ? "queued" : "failed", job.attempts, message]
    )
    if (job.kind === "analyze") {
      const r = await pool.query(
        'SELECT id,name,email FROM "user" WHERE id=$1',
        [job.user_id]
      )
      if (r.rows[0])
        await documents.failed(r.rows[0], job.document_id, retry, message)
    }
    console.error(`Processing failed for ${job.id}; retry: ${retry}.`)
  } finally {
    clearInterval(heartbeat)
  }
}
await Promise.all([pool.end(), secretPool.end()])
