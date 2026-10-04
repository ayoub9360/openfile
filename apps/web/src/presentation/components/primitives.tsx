"use client"
import type { ReactNode } from "react"
import {
  FileText,
  Folder,
  Cloud,
  HardDrive,
  ArrowUpRight,
  SearchX,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@open-file/ui/components/dialog"
import type { Document } from "../../domain/workspace"
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: string
}) {
  return <span className={`pill ${tone}`}>{children}</span>
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  )
}
export function PanelHeading({
  title,
  action,
  description,
}: {
  title: string
  action?: ReactNode
  description?: string
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}
export function FileIcon({ kind = "Document" }: { kind?: string }) {
  return (
    <span
      className={`file-icon ${kind === "Invoice" ? "blue" : kind === "Contract" ? "purple" : kind === "Certificate" ? "amber" : "neutral"}`}
    >
      <FileText size={18} strokeWidth={1.7} />
    </span>
  )
}
export function StorageIcon({ name }: { name: string }) {
  if (name === "Google Drive")
    return (
      <span className="drive-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path d="M8 2h8l8 14h-8z" fill="#fbbc04" />
          <path d="M8 2 0 16l4 7 8-14z" fill="#34a853" />
          <path d="M0 16h24l-4 7H4z" fill="#4285f4" />
        </svg>
      </span>
    )
  return (
    <span
      className={`storage-icon ${name === "OneDrive" ? "blue" : "neutral"}`}
    >
      {name === "Local folders" || name === "Local" ? (
        <HardDrive size={21} />
      ) : (
        <Cloud size={23} fill={name === "OneDrive" ? "currentColor" : "none"} />
      )}
    </span>
  )
}
export function EmptyState({
  title = "No documents found",
  description = "Try different filters or add a document.",
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <SearchX size={28} strokeWidth={1.4} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  blocking = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  children: ReactNode
  wide?: boolean
  blocking?: boolean
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => !value && !blocking && onClose()}
    >
      <DialogContent
        showCloseButton={!blocking}
        className={`app-dialog ${wide ? "wide-dialog" : ""}`}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
export function DocumentRow({
  document,
  onClick,
}: {
  document: Document
  onClick: () => void
}) {
  return (
    <button className="document-row" onClick={onClick}>
      <FileIcon kind={document.kind} />
      <span className="grow truncate">
        <strong>{document.name}</strong>
        <small>
          {document.issuer} <span className="dot-separator">·</span>{" "}
          {document.folder}
        </small>
      </span>
      <span className="row-date">{dateLabel(document.date)}</span>
      <ArrowUpRight size={15} className="muted" />
    </button>
  )
}
export function FolderPath({ children }: { children: ReactNode }) {
  return (
    <span className="folder-path">
      <Folder size={13} />
      {children}
    </span>
  )
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date))
}
export function money(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(value)
}
