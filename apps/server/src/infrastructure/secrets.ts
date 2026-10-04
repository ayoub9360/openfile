import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import type { Pool } from "pg"
import type { SecretStore } from "../application/ports"
import { defaultSecrets, type Secrets } from "../domain/model"
export class EncryptedSecrets implements SecretStore {
  constructor(
    private pool: Pool,
    private key: Buffer
  ) {}
  private seal(value: Secrets, userId: string) {
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", this.key, iv)
    cipher.setAAD(Buffer.from(userId))
    const bytes = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ])
    return [
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      bytes.toString("base64"),
    ].join(".")
  }
  private open(value: string, userId: string): Secrets {
    const [iv, tag, data] = value.split(".")
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(iv!, "base64")
    )
    cipher.setAAD(Buffer.from(userId))
    cipher.setAuthTag(Buffer.from(tag!, "base64"))
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(data!, "base64")),
        cipher.final(),
      ]).toString("utf8")
    )
  }
  async get(userId: string) {
    const { rows } = await this.pool.query(
      "SELECT ciphertext FROM user_secrets WHERE user_id=$1",
      [userId]
    )
    return rows[0] ? this.open(rows[0].ciphertext, userId) : defaultSecrets()
  }
  async update(userId: string, change: (value: Secrets) => Secrets) {
    const db = await this.pool.connect()
    try {
      await db.query("BEGIN")
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,1))", [
        userId,
      ])
      const { rows } = await db.query(
        "SELECT ciphertext FROM user_secrets WHERE user_id=$1",
        [userId]
      )
      const next = change(
        rows[0] ? this.open(rows[0].ciphertext, userId) : defaultSecrets()
      )
      await db.query(
        "INSERT INTO user_secrets(user_id,ciphertext) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET ciphertext=$2",
        [userId, this.seal(next, userId)]
      )
      await db.query("COMMIT")
      return next
    } catch (error) {
      await db.query("ROLLBACK")
      throw error
    } finally {
      db.release()
    }
  }
}
