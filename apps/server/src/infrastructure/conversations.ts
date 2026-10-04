import { env } from "../config"
import { randomUUID } from "node:crypto"
import type { Pool } from "pg"
import type {
  AssistantScope,
  ChatMessage,
  Conversation,
  ConversationSummary,
} from "@open-file/core/assistant"
import type { ConversationStore } from "../application/assistant-ports"
import { AppError, type User } from "../domain/model"
export class PostgresConversations implements ConversationStore {
  constructor(private pool: Pool) {}
  async create(user: User, scope: AssistantScope): Promise<Conversation> {
    const id = randomUUID()
    const db = await this.pool.connect()
    try {
      await db.query("BEGIN")
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,2))", [
        user.id,
      ])
      const count = await db.query(
        "SELECT count(*)::int AS count FROM conversations WHERE user_id=$1",
        [user.id]
      )
      if (count.rows[0].count >= env.MAX_CONVERSATIONS)
        throw new AppError(
          413,
          "Conversation limit reached. Delete an old conversation first."
        )
      await db.query(
        "INSERT INTO conversations(id,user_id,scope) VALUES($1,$2,$3)",
        [id, user.id, scope]
      )
      await db.query("COMMIT")
    } catch (error) {
      await db.query("ROLLBACK")
      throw error
    } finally {
      db.release()
    }
    return this.load(user, id)
  }
  async delete(user: User, id: string) {
    const db = await this.pool.connect()
    try {
      await db.query("BEGIN")
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,2))", [
        user.id,
      ])
      const result = await db.query(
        "DELETE FROM conversations WHERE user_id=$1 AND id=$2",
        [user.id, id]
      )
      if (!result.rowCount) throw new AppError(404, "Conversation not found.")
      await db.query("COMMIT")
    } catch (error) {
      await db.query("ROLLBACK")
      throw error
    } finally {
      db.release()
    }
  }
  async list(user: User): Promise<ConversationSummary[]> {
    const { rows } = await this.pool.query(
      'SELECT id,title,scope,updated_at AS "updatedAt" FROM conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 100',
      [user.id]
    )
    return rows
  }
  async load(user: User, id: string): Promise<Conversation> {
    const { rows } = await this.pool.query(
      `SELECT id,title,scope,updated_at AS "updatedAt" FROM conversations WHERE user_id=$1 AND id=$2`,
      [user.id, id]
    )
    if (!rows[0]) throw new AppError(404, "Conversation not found.")
    const messages = await this.pool.query(
      `SELECT body,created_at < now()-interval '3 minutes' AS expired FROM (SELECT * FROM conversation_messages WHERE conversation_id=$1 ORDER BY sequence DESC LIMIT $2) recent ORDER BY sequence`,
      [id, env.MAX_CONVERSATION_MESSAGES]
    )
    return {
      ...rows[0],
      messages: messages.rows.map(({ body, expired }) =>
        expired && body.status === "running"
          ? {
              ...body,
              status: "interrupted",
              notice:
                "This response was interrupted. Send your question again to continue.",
            }
          : body
      ),
    }
  }
  async begin(user: User, id: string, messageId: string, text: string) {
    const db = await this.pool.connect()
    try {
      await db.query("BEGIN")
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,2))", [
        user.id,
      ])
      const size = await db.query(
        "SELECT count(*)::int AS count FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND c.id=$2",
        [user.id, id]
      )
      if (size.rows[0].count + 2 > env.MAX_CONVERSATION_MESSAGES)
        throw new AppError(
          413,
          "This conversation is full. Start a new conversation."
        )
      const concurrent = await db.query(
        "SELECT count(*)::int AS count FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.body->>'status'='running' AND m.created_at>now()-interval '3 minutes'",
        [user.id]
      )
      if (concurrent.rows[0].count >= 2)
        throw new AppError(
          429,
          "Two responses are already in progress. Wait for them to finish."
        )
      const { rowCount } = await db.query(
        "SELECT id FROM conversations WHERE user_id=$1 AND id=$2 FOR UPDATE",
        [user.id, id]
      )
      if (!rowCount) throw new AppError(404, "Conversation not found.")
      const active = await db.query(
        `SELECT 1 FROM conversation_messages WHERE conversation_id=$1 AND body->>'status'='running' AND created_at>now()-interval '3 minutes'`,
        [id]
      )
      if (active.rowCount)
        throw new AppError(
          409,
          "A response is already in progress in this conversation."
        )
      const duplicate = await db.query(
        "SELECT 1 FROM conversation_messages WHERE conversation_id=$1 AND id=$2",
        [id, messageId]
      )
      if (duplicate.rowCount)
        throw new AppError(
          409,
          "This message was already received. Reload the conversation."
        )
      await db.query(
        `UPDATE conversation_messages SET body=jsonb_set(body,'{status}','"interrupted"') WHERE conversation_id=$1 AND body->>'status'='running'`,
        [id]
      )
      const human: ChatMessage = {
        id: messageId,
        role: "user",
        text,
        sources: [],
        tools: [],
        status: "complete",
      }
      const assistant: ChatMessage = {
        id: randomUUID(),
        role: "assistant",
        text: "",
        sources: [],
        tools: [],
        status: "running",
      }
      for (const message of [human, assistant])
        await db.query(
          "INSERT INTO conversation_messages(conversation_id,id,body) VALUES($1,$2,$3)",
          [id, message.id, JSON.stringify(message)]
        )
      await db.query(
        "UPDATE conversations SET title=CASE WHEN title='New conversation' THEN $3 ELSE title END,updated_at=now() WHERE user_id=$1 AND id=$2",
        [user.id, id, text.slice(0, 100)]
      )
      await db.query("COMMIT")
    } catch (error) {
      await db.query("ROLLBACK")
      throw error
    } finally {
      db.release()
    }
    return this.load(user, id)
  }
  async finish(user: User, id: string, message: ChatMessage) {
    const db = await this.pool.connect()
    try {
      await db.query("BEGIN")
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,2))", [
        user.id,
      ])
      const saved = await db.query(
        `UPDATE conversation_messages m SET body=$4 FROM conversations c WHERE c.id=m.conversation_id AND c.user_id=$1 AND c.id=$2 AND m.id=$3 AND m.body->>'status'='running'`,
        [user.id, id, message.id, JSON.stringify(message)]
      )
      if (!saved.rowCount)
        Object.assign(message, {
          text: "",
          sources: [],
          documents: [],
          tools: [],
          status: "interrupted",
          notice: "This conversation was removed or interrupted.",
        })
      await db.query(
        "UPDATE conversations SET updated_at=now() WHERE user_id=$1 AND id=$2",
        [user.id, id]
      )
      await db.query("COMMIT")
    } catch (error) {
      await db.query("ROLLBACK")
      throw error
    } finally {
      db.release()
    }
  }
}
