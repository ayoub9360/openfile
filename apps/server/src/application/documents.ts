import { randomUUID } from "node:crypto"
import type { Document, Workspace, Storage } from "@open-file/core/workspace"
import type {
  Repository,
  SecretStore,
  StorageRegistry,
  Intelligence,
  TextExtractor,
} from "./ports"
import {
  AppError,
  destination,
  safeFolder,
  safeSegment,
  splitText,
  type User,
  type FileRef,
} from "../domain/model"
export class Documents {
  constructor(
    readonly repository: Repository,
    private secrets: SecretStore,
    private storage: StorageRegistry,
    private ai: Intelligence,
    private extractor: TextExtractor
  ) {}
  async load(user: User) {
    const state = await this.repository.load(user)
    const s = await this.secrets.get(user.id)
    state.connectors = state.connectors.map((c) =>
      c.id === "drive"
        ? { ...c, connected: !!s.driveRefreshToken, folder: s.driveFolder }
        : { ...c, folder: s.localFolder }
    )
    state.settings.email = user.email
    return state
  }
  async import(
    user: User,
    bytes: Uint8Array,
    name: string,
    mime: string,
    target: Storage
  ) {
    const storage = destination(target)
    safeSegment(name)
    const settings = await this.secrets.get(user.id)
    const folder = storage === "Local" ? settings.localFolder : "Documents"
    const stagingFolder =
      storage === "Local"
        ? `${settings.localFolder}/.imports`
        : "Pending imports"
    let ref: FileRef | undefined
    const id = randomUUID()
    try {
      await this.repository.transaction(user, async (u) => {
        await u.checkCapacity(bytes.length, true)
        ref = await this.storage
          .get(storage)
          .put(user.id, bytes, name, stagingFolder, mime)
        u.state.documents.unshift({
          id,
          name,
          originalName: name,
          createdAt: new Date().toISOString(),
          kind: "Document",
          issuer: "Not specified",
          date: new Date().toISOString().slice(0, 10),
          storage,
          folder,
          tags: [],
          status: "pending",
          confidence: 0,
          favorite: false,
          size: `${Math.max(1, Math.round(bytes.length / 1024))} KB`,
          content: "",
          summary: "Awaiting analysis",
          imported: true,
          mimeType: mime,
          processing: "queued",
          revision: 1,
        })
        await u.setFile(id, ref)
        await u.enqueue("analyze", id)
        this.activity(u.state, "Document imported", name, id)
      })
    } catch (error) {
      if (ref)
        await this.storage
          .get(storage)
          .remove(user.id, ref)
          .catch(() => {})
      throw error
    }
    return id
  }
  private activity(
    state: Workspace,
    title: string,
    detail: string,
    documentId?: string
  ) {
    state.activities.unshift({
      id: randomUUID(),
      title,
      detail,
      date: new Date().toISOString(),
      documentId,
    })
  }
  async save(
    user: User,
    id: string,
    patch: Partial<Document>,
    approve = false
  ) {
    let created: FileRef | undefined
    try {
      await this.repository.transaction(user, async (u) => {
        const doc = u.state.documents.find((d) => d.id === id)
        if (!doc) throw new AppError(404, "Document not found.")
        if (doc.processing === "queued" || doc.processing === "processing")
          throw new AppError(409, "Wait for processing to finish.")
        if (patch.revision !== undefined && patch.revision !== doc.revision)
          throw new AppError(
            409,
            "This document has changed. Close and reopen its details."
          )
        const name = safeSegment(patch.name ?? doc.name)
        const folder = safeFolder(patch.folder ?? doc.folder)
        const target = destination(patch.storage ?? doc.storage)
        if (
          name !== doc.name ||
          folder !== doc.folder ||
          target !== doc.storage ||
          approve
        ) {
          const old = await u.file(id)
          if (!old) throw new AppError(404, "File not found.")
          await u.checkCapacity(old.bytes, false)
          const data = await this.storage.get(old.storage).read(user.id, old)
          created = await this.storage
            .get(target)
            .put(user.id, data, name, folder, old.mimeType)
          await u.setFile(id, created)
          await u.enqueue("cleanup", id, old)
        }
        Object.assign(doc, patch, {
          id,
          name,
          folder,
          storage: target,
          status: approve ? "filed" : doc.status,
          revision: (doc.revision ?? 0) + 1,
        })
        if (approve) delete doc.classification
        this.activity(
          u.state,
          approve ? "Document filed" : "Document modified",
          doc.name,
          id
        )
      })
    } catch (e) {
      if (created)
        await this.storage
          .get(created.storage)
          .remove(user.id, created)
          .catch(() => {})
      throw e
    }
    return this.load(user)
  }
  async delete(user: User, id: string) {
    await this.repository.transaction(user, async (u) => {
      const doc = u.state.documents.find((d) => d.id === id)
      if (!doc) throw new AppError(404, "Document not found.")
      if (doc.processing === "queued" || doc.processing === "processing")
        throw new AppError(409, "Wait for processing to finish.")
      const ref = await u.file(id)
      // Commit removal and durable storage cleanup together.
      if (ref) await u.enqueue("cleanup", id, ref)
      await u.purgeConversations(id)
      await u.deleteFile(id)
      await u.setChunks(id, [])
      u.state.documents = u.state.documents.filter((d) => d.id !== id)
      this.activity(u.state, "Document deleted", doc.name, id)
    })
    return this.load(user)
  }
  async action(
    user: User,
    id: string,
    action: "archive" | "favorite" | "retry"
  ) {
    await this.repository.transaction(user, async (u) => {
      const doc = u.state.documents.find((d) => d.id === id)
      if (!doc) throw new AppError(404, "Document not found.")
      if (action === "favorite") doc.favorite = !doc.favorite
      else if (action === "archive") {
        doc.status = "archived"
        delete doc.classification
        this.activity(u.state, "Document archived", doc.name, id)
      } else {
        if (doc.processing === "queued" || doc.processing === "processing")
          throw new AppError(409, "Processing is already in progress.")
        if (doc.status === "filed")
          doc.classification = { name: doc.name, folder: doc.folder }
        doc.processing = "queued"
        delete doc.processingError
        await u.enqueue("analyze", id)
      }
      doc.revision = (doc.revision ?? 0) + 1
    })
    return this.load(user)
  }
  async file(user: User, id: string) {
    const ref = await this.repository.file(user.id, id)
    if (!ref) throw new AppError(404, "File not found.")
    return { ref, data: await this.storage.get(ref.storage).read(user.id, ref) }
  }
  async analyze(user: User, id: string) {
    await this.repository.transaction(user, async (u) => {
      const doc = u.state.documents.find((d) => d.id === id)
      if (doc) doc.processing = "processing"
    })
    const { ref, data } = await this.file(user, id)
    const initial = (await this.repository.load(user)).documents.find(
      (d) => d.id === id
    )
    if (!initial) return
    const settings = await this.secrets.get(user.id)
    let text = ""
    try {
      text = await this.extractor.extract(data, ref.mimeType)
    } catch {
      if (!settings.ai.enabled || !settings.aiKey)
        throw new AppError(
          422,
          "This PDF could not be read. Check that it is not protected or enable a compatible AI model."
        )
    }
    // Keep lexical indexing available even if the provider subsequently fails.
    await this.repository.transaction(user, async (u) => {
      const doc = u.state.documents.find((d) => d.id === id)
      if (doc) {
        doc.content = text
        doc.analysisMode =
          settings.ai.enabled && settings.aiKey ? "ai" : "manual"
      }
      await u.setChunks(
        id,
        splitText(text).map((text) => ({
          id: randomUUID(),
          documentId: id,
          text,
        }))
      )
    })
    const analysis = await this.ai.analyze(
      user.id,
      data,
      ref.mimeType,
      initial.originalName,
      text,
      [
        ...new Set(
          (await this.repository.load(user)).documents
            .filter(
              (d) => d.status === "filed" && d.storage === initial.storage
            )
            .map((d) => d.folder)
        ),
      ].slice(0, 100)
    )
    const texts = splitText(analysis.text)
    let embeddings: Awaited<ReturnType<Intelligence["embed"]>>
    let warning: string | undefined
    try {
      embeddings = await this.ai.embed(user.id, texts)
    } catch (e) {
      warning =
        e instanceof AppError
          ? `Semantic search unavailable: ${e.message}`
          : "Semantic indexing failed. Text search remains available."
    }
    await this.repository.transaction(user, async (u) => {
      const doc = u.state.documents.find((d) => d.id === id)
      if (!doc) return
      let name = initial.originalName
      let folder = initial.folder
      try {
        name = safeSegment(analysis.metadata.name)
        folder = safeFolder(analysis.metadata.folder)
      } catch {
        /* Invalid suggestions preserve the original destination. */
      }
      if (!settings.ai.enabled || !settings.aiKey)
        folder =
          initial.storage === "Local" ? settings.localFolder : "Documents"
      const customNaming =
        u.state.settings.naming &&
        u.state.settings.naming !== "{date}_{type}_{émetteur}"
      if (settings.ai.enabled && customNaming) {
        const naming = u.state.settings.naming
        const extension = initial.originalName.match(/\.[^.]+$/)?.[0] ?? ""
        try {
          name = safeSegment(
            naming
              .replaceAll("{date}", analysis.metadata.date)
              .replaceAll("{type}", analysis.metadata.kind)
              .replaceAll("{issuer}", analysis.metadata.issuer)
              .replaceAll("{émetteur}", analysis.metadata.issuer) + extension
          )
        } catch {
          /* Keep the validated name. */
        }
      }
      if (
        initial.storage === "Local" &&
        !folder.startsWith(settings.localFolder + "/") &&
        folder !== settings.localFolder
      )
        folder = `${settings.localFolder}/${folder}`

      if (doc.status === "filed") doc.classification = { name, folder }
      Object.assign(doc, analysis.metadata, {
        name: doc.status === "pending" ? name : doc.name,
        folder: doc.status === "pending" ? folder : doc.folder,
        content: analysis.text,
        amount: analysis.amount,
        processing: "ready",
        processingError: undefined,
        processingWarning: warning,
        analysisMode: settings.ai.enabled && settings.aiKey ? "ai" : "manual",
        revision: (doc.revision ?? 0) + 1,
      })
      await u.setChunks(
        id,
        texts.map((text, i) => ({
          id: randomUUID(),
          documentId: id,
          text,
          embedding: embeddings?.vectors[i],
          model: embeddings?.model,
        }))
      )
      this.activity(u.state, "Analysis complete", doc.name, id)
    })
  }
  async failed(user: User, id: string, retry: boolean, message?: string) {
    await this.repository.transaction(user, async (u) => {
      const d = u.state.documents.find((d) => d.id === id)
      if (d) {
        d.processing = retry ? "queued" : "failed"
        d.processingError =
          message ??
          "Processing failed. Check the file, storage connection, and AI settings, then try again."
      }
    })
  }
  async cleanup(user: User, id: string, ref: FileRef) {
    const current = await this.repository.file(user.id, id)
    if (current?.storage !== ref.storage || current.key !== ref.key)
      await this.storage.get(ref.storage).remove(user.id, ref)
  }
  async answer(user: User, question: string, ids?: string[]) {
    let e: Awaited<ReturnType<Intelligence["embed"]>>
    let notice: string | undefined
    try {
      e = await this.ai.embed(user.id, [question])
    } catch (error) {
      notice =
        error instanceof AppError
          ? error.message
          : "Semantic search unavailable. Using text search."
    }
    const sources = await this.repository.search(
      user.id,
      question,
      ids,
      e?.vectors[0],
      e?.model
    )
    if (notice)
      return {
        text: sources.length
          ? "Here are the passages found in your documents. The AI answer is unavailable."
          : "No matching passages found using text search.",
        sources,
        notice,
      }
    try {
      return { text: await this.ai.answer(user.id, question, sources), sources }
    } catch (error) {
      return {
        text: "Here are the matching passages. The AI answer is unavailable.",
        sources,
        notice:
          error instanceof AppError
            ? error.message
            : "The AI provider is unavailable.",
      }
    }
  }
}
