"use client"

import { useState } from "react"
import { FileText, ImageIcon, Star } from "lucide-react"
import { Skeleton } from "@open-file/ui/components/skeleton"
import type { Document } from "../../domain/workspace"

export function DocumentCard({
  document,
  onOpen,
}: {
  document: Document
  onOpen: () => void
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading"
  )
  const pdf = document.mimeType === "application/pdf"
  const picture = document.mimeType?.startsWith("image/")
  const supported = pdf || picture
  const format = pdf
    ? "PDF"
    : document.name.split(".").pop()?.toUpperCase().slice(0, 8) || "FILE"
  const Icon = picture ? ImageIcon : FileText
  return (
    <button
      className="document-card"
      onClick={onOpen}
      aria-label={`Open ${document.name}`}
    >
      <div
        className="document-thumbnail"
        aria-busy={!!supported && status === "loading"}
      >
        {supported && status !== "failed" ? (
          <>
            {status === "loading" && (
              <>
                <Skeleton className="thumbnail-skeleton" aria-hidden="true" />
                <span className="sr-only" role="status">
                  Loading preview…
                </span>
              </>
            )}
            {/* Authenticated thumbnail endpoint; the server already resizes the image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/documents/${encodeURIComponent(document.id)}/preview`}
              alt=""
              loading="lazy"
              decoding="async"
              className={status === "ready" ? "is-ready" : ""}
              onLoad={() => setStatus("ready")}
              onError={() => setStatus("failed")}
            />
          </>
        ) : (
          <div className="thumbnail-fallback">
            <Icon size={32} strokeWidth={1.25} />
            <span>Preview unavailable</span>
          </div>
        )}
        {document.favorite && (
          <span className="thumbnail-favorite" title="Favorite">
            <Star size={14} fill="currentColor" />
          </span>
        )}
      </div>
      <div className="document-card-info">
        <span className="document-format">{format}</span>
        <strong title={document.name}>{document.name}</strong>
      </div>
      <div className="document-card-bottom">
        <span>{document.storage}</span>
        <span>{document.size}</span>
      </div>
    </button>
  )
}
