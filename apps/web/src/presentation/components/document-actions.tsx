"use client"

import { useRef, useState } from "react"
import { ExternalLink, MoreHorizontal, Star, Trash2 } from "lucide-react"
import { Button } from "@open-file/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@open-file/ui/components/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@open-file/ui/components/dialog"
import type { Document } from "../../domain/workspace"
import { useWorkspace } from "../workspace-context"

export function DocumentActions({ document }: { document: Document }) {
  const { service, run } = useWorkspace()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const inProgress = useRef(false)
  const processing =
    document.processing === "queued" || document.processing === "processing"

  async function perform(action: () => Promise<boolean>) {
    if (inProgress.current) return
    inProgress.current = true
    setBusy(true)
    try {
      await action()
    } finally {
      inProgress.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" />}
          aria-label={`Actions for ${document.name}`}
          disabled={busy}
        >
          <MoreHorizontal size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            render={
              <a
                href={`/api/documents/${encodeURIComponent(document.id)}/file`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <ExternalLink /> Open file
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              perform(() =>
                run(
                  () => service.toggleFavorite(document.id),
                  "Favorite updated"
                )
              )
            }
          >
            <Star fill={document.favorite ? "currentColor" : "none"} />
            {document.favorite ? "Remove from favorites" : "Add to favorites"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={processing}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!busy) setConfirmDelete(open)
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Delete file?</DialogTitle>
            <DialogDescription>
              “{document.name}” will be permanently removed from your library
              and{" "}
              {document.storage === "Local"
                ? "local storage"
                : document.storage}
              . Conversations citing it and any conversations with a response in
              progress will also be deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  const deleted = await run(
                    () => service.deleteDocument(document.id),
                    "File deleted"
                  )
                  if (deleted) setConfirmDelete(false)
                  return deleted
                })
              }
            >
              {busy ? "Deleting…" : "Delete file"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
