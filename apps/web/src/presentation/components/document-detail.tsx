"use client"
import { AppSelect } from "./app-select"

import { useEffect, useId, useRef, useState } from "react"
import {
  Archive,
  Check,
  ExternalLink,
  FileText,
  Folder,
  LoaderCircle,
  MoreHorizontal,
  RotateCcw,
  Sparkles,
  Star,
  X,
} from "lucide-react"
import { Button } from "@open-file/ui/components/button"
import { Badge } from "@open-file/ui/components/badge"
import { Input } from "@open-file/ui/components/input"
import { Field, FieldLabel } from "@open-file/ui/components/field"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@open-file/ui/components/tabs"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@open-file/ui/components/combobox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@open-file/ui/components/drawer"
import { useIsMobile } from "@open-file/ui/hooks/use-mobile"
import { kinds, storages, type Document } from "../../domain/workspace"
import { useWorkspace } from "../workspace-context"

type EditableFields = Pick<
  Document,
  "name" | "kind" | "date" | "issuer" | "storage" | "folder" | "tags"
>

export function DocumentDetail({
  document,
  onClose,
}: {
  document: Document
  onClose: () => void
}) {
  const { state, service, run, openImport } = useWorkspace()
  const isMobile = useIsMobile()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [changes, setChanges] = useState<Partial<EditableFields>>({})
  const [tab, setTab] = useState("details")
  const [tagInput, setTagInput] = useState("")
  const [busy, setBusy] = useState(false)
  const actionInProgress = useRef(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [error, setError] = useState("")
  // Only edited fields override the refreshed document (including its revision).
  const draft = { ...document, ...changes }
  const tags = [
    ...new Set(
      [...draft.tags, ...tagInput.split(",")]
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
  ]
  const dirty =
    Object.entries(changes).some(
      ([key, value]) =>
        JSON.stringify(value) !==
        JSON.stringify(document[key as keyof EditableFields])
    ) || tagInput.trim().length > 0
  const processing =
    document.processing === "queued" || document.processing === "processing"
  const pending = document.status === "pending"
  const folders = [
    ...new Set(
      state.documents
        .filter(
          (item) => item.storage === draft.storage && item.status !== "pending"
        )
        .flatMap((item) => {
          const parts = item.folder.split("/").filter(Boolean)
          return parts.map((_, index) => parts.slice(0, index + 1).join("/"))
        })
    ),
  ].sort((a, b) => a.localeCompare(b, "en"))
  const suggestedTags = [
    ...new Set(state.documents.flatMap((item) => item.tags)),
  ].filter((tag) => !draft.tags.includes(tag))
  const fileUrl = `/api/documents/${document.id}/file`
  const fileType =
    document.mimeType === "application/pdf"
      ? "PDF"
      : document.mimeType?.startsWith("image/")
        ? "Image"
        : "Document"

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!dirty) return
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", preventUnload)
    return () => window.removeEventListener("beforeunload", preventUnload)
  }, [dirty])

  function update<K extends keyof EditableFields>(
    key: K,
    value: EditableFields[K]
  ) {
    setChanges((previous) => ({ ...previous, [key]: value }))
    setError("")
  }

  async function perform(action: () => Promise<void>) {
    if (actionInProgress.current) return
    actionInProgress.current = true
    setBusy(true)
    try {
      await action()
    } finally {
      actionInProgress.current = false
      setBusy(false)
    }
  }

  async function save(approve = false) {
    if (processing) return
    if (
      !draft.name.trim() ||
      /[\\/]/.test(draft.name) ||
      !draft.folder.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
      Number.isNaN(Date.parse(draft.date))
    ) {
      setTab("details")
      setError(
        "Enter a file name without slashes, a valid date, and a destination folder."
      )
      return
    }
    await perform(async () => {
      if (
        await run(
          () => service.saveDocument({ ...draft, tags }, approve),
          approve ? "Document approved and filed" : "Document updated"
        )
      ) {
        setOpen(false)
      }
    })
  }

  function addTags() {
    if (tagInput.trim()) update("tags", tags)
    setTagInput("")
  }

  const preview = (
    <section className="doc-detail-preview" aria-label="Document preview">
      <div className="doc-detail-preview-toolbar">
        <span>
          <FileText size={15} /> Original file
        </span>
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Open original file in a new tab"
        >
          Open <ExternalLink size={14} />
        </a>
      </div>
      <div className="doc-detail-preview-canvas">
        {document.mimeType?.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl} alt={document.name} />
        ) : document.mimeType === "application/pdf" ? (
          <iframe src={fileUrl} title={`Preview of ${document.name}`} />
        ) : (
          <pre>
            {document.content ||
              "No preview available. Open the original file to view it."}
          </pre>
        )}
      </div>
      <p className="doc-detail-original-name" title={document.originalName}>
        {document.originalName}
      </p>
    </section>
  )

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && (busy || dirty)) {
          details.cancel()
          if (!busy) setConfirmClose(true)
          return
        }
        setOpen(nextOpen)
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
      showSwipeHandle={isMobile}
      swipeDirection={isMobile ? "down" : "right"}
    >
      <DrawerContent className="doc-detail data-[swipe-axis=x]:h-dvh data-[swipe-axis=x]:[--drawer-content-width:min(76rem,calc(100vw-2rem))] data-[swipe-axis=y]:h-[96dvh] data-[swipe-axis=y]:[--drawer-content-max-height:96dvh] data-[swipe-axis=x]:sm:[--drawer-content-width:min(76rem,calc(100vw-2rem))]">
        <DrawerHeader className="doc-detail-header">
          <div className="doc-detail-heading">
            <span className="doc-detail-file-icon">
              <FileText size={22} />
            </span>
            <div className="min-w-0">
              <DrawerTitle className="doc-detail-title" title={document.name}>
                {document.name}
              </DrawerTitle>
              <DrawerDescription className="doc-detail-subtitle">
                {[document.issuer, fileType, document.size]
                  .filter(Boolean)
                  .join(" · ")}
              </DrawerDescription>
            </div>
          </div>
          <div className="doc-detail-header-actions">
            <Badge
              variant="outline"
              className={`doc-detail-status ${pending ? "is-pending" : ""}`}
            >
              {pending
                ? "Needs review"
                : document.status === "archived"
                  ? "Archived"
                  : "Filed"}
            </Badge>
            <Button
              variant="ghost"
              size="icon-lg"
              disabled={busy}
              aria-pressed={document.favorite}
              aria-label={
                document.favorite ? "Remove from favorites" : "Add to favorites"
              }
              title={
                document.favorite ? "Remove from favorites" : "Add to favorites"
              }
              onClick={() =>
                perform(async () => {
                  await run(
                    () => service.toggleFavorite(document.id),
                    "Favorite updated"
                  )
                })
              }
            >
              <Star fill={document.favorite ? "currentColor" : "none"} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-lg" />}
                aria-label="More actions"
                disabled={busy}
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {dirty && (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    Save your changes before changing the filing.
                  </p>
                )}
                <DropdownMenuItem
                  disabled={dirty || processing || busy}
                  onClick={() =>
                    perform(async () => {
                      if (
                        await run(
                          () => service.retryDocument(document.id),
                          "Analysis restarted"
                        )
                      ) {
                        onClose()
                        openImport(document.id)
                      }
                    })
                  }
                >
                  <RotateCcw /> Suggest a new filing
                </DropdownMenuItem>
                {document.status !== "archived" && (
                  <DropdownMenuItem
                    disabled={dirty || processing || busy}
                    onClick={() =>
                      perform(async () => {
                        if (
                          await run(
                            () => service.archiveDocument(document.id),
                            "Document archived"
                          )
                        )
                          setOpen(false)
                      })
                    }
                  >
                    <Archive /> Archive
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DrawerClose
              render={<Button variant="ghost" size="icon-lg" />}
              disabled={busy}
              aria-label="Close document details"
            >
              <X />
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="doc-detail-body">
          {!isMobile && preview}
          <Tabs
            value={!isMobile && tab === "preview" ? "details" : tab}
            onValueChange={(value) => setTab(String(value))}
            className="doc-detail-inspector"
          >
            <TabsList
              variant="line"
              className="doc-detail-tabs"
              aria-label="Document content"
            >
              <TabsTrigger value="details">Information</TabsTrigger>
              {isMobile && <TabsTrigger value="preview">Preview</TabsTrigger>}
              <TabsTrigger value="text">Extracted text</TabsTrigger>
            </TabsList>
            {isMobile && (
              <TabsContent
                value="preview"
                className="doc-detail-mobile-preview"
              >
                {preview}
              </TabsContent>
            )}
            <TabsContent value="text" className="doc-detail-scroll">
              <div className="doc-detail-section-heading">
                <FileText size={16} />
                <h3>Extracted text</h3>
              </div>
              <p className="doc-detail-help">
                The content used to search your documents.
              </p>
              <pre className="doc-detail-text">
                {document.content ||
                  (processing
                    ? "Text will appear when analysis is complete."
                    : "No text extracted for this document.")}
              </pre>
            </TabsContent>
            <TabsContent value="details" className="doc-detail-scroll">
              {processing && (
                <div className="doc-detail-notice" role="status">
                  <LoaderCircle className="animate-spin" size={16} /> Analysis
                  in progress. Information will update automatically.
                </div>
              )}
              {document.processing === "failed" && (
                <div className="doc-detail-notice is-error" role="alert">
                  {document.processingError ||
                    "Analysis failed. You can retry it from the actions menu."}
                </div>
              )}
              {document.processingWarning && (
                <div className="doc-detail-notice" role="status">
                  {document.processingWarning}
                </div>
              )}
              {document.summary && (
                <div className="doc-detail-summary">
                  <div className="doc-detail-section-heading">
                    <Sparkles size={15} />
                    <h3>At a glance</h3>
                  </div>
                  <p>{document.summary}</p>
                  {pending && document.analysisMode === "ai" && (
                    <span className="doc-detail-help">
                      AI suggestion · Review before filing
                    </span>
                  )}
                </div>
              )}
              <form
                id={`${id}-form`}
                onSubmit={(event) => {
                  event.preventDefault()
                  void save(pending)
                }}
                noValidate
              >
                <fieldset
                  disabled={busy || processing}
                  className="doc-detail-fields"
                >
                  <legend className="doc-detail-section-label">Document</legend>
                  <Field>
                    <FieldLabel htmlFor={`${id}-name`}>File name</FieldLabel>
                    <Input
                      id={`${id}-name`}
                      value={draft.name}
                      onChange={(event) => update("name", event.target.value)}
                      required
                    />
                  </Field>
                  <div className="doc-detail-field-row">
                    <Field>
                      <FieldLabel htmlFor={`${id}-kind`}>Type</FieldLabel>
                      <AppSelect
                        id={`${id}-kind`}
                        value={draft.kind}
                        onValueChange={(value) =>
                          update("kind", value as Document["kind"])
                        }
                        disabled={busy || processing}
                        options={kinds.map((value) => ({
                          value,
                          label: value,
                        }))}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
                      <Input
                        id={`${id}-date`}
                        type="date"
                        value={draft.date}
                        onChange={(event) => update("date", event.target.value)}
                        required
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor={`${id}-issuer`}>Issuer</FieldLabel>
                    <Input
                      id={`${id}-issuer`}
                      value={draft.issuer}
                      placeholder="Company or organization"
                      onChange={(event) => update("issuer", event.target.value)}
                    />
                  </Field>
                </fieldset>
                <fieldset
                  disabled={busy || processing}
                  className="doc-detail-fields doc-detail-classification"
                >
                  <legend className="doc-detail-section-label">Filing</legend>
                  <Field>
                    <FieldLabel htmlFor={`${id}-storage`}>
                      Storage location
                    </FieldLabel>
                    <AppSelect
                      id={`${id}-storage`}
                      value={draft.storage}
                      onValueChange={(value) =>
                        update("storage", value as Document["storage"])
                      }
                      disabled={busy || processing}
                      options={[...new Set([...storages, draft.storage])].map(
                        (value) => ({ value, label: value })
                      )}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-folder`}>
                      Destination folder
                    </FieldLabel>
                    <Combobox
                      items={folders}
                      inputValue={draft.folder}
                      disabled={busy || processing}
                      onInputValueChange={(value, details) => {
                        if (
                          details.reason === "input-change" ||
                          details.reason === "item-press" ||
                          details.reason === "input-clear"
                        )
                          update("folder", value)
                      }}
                      onValueChange={(value) => {
                        if (typeof value === "string") update("folder", value)
                      }}
                    >
                      <ComboboxInput
                        id={`${id}-folder`}
                        placeholder="Search or enter a folder"
                      />
                      <ComboboxContent>
                        <ComboboxEmpty>
                          No existing folders. Enter a new path.
                        </ComboboxEmpty>
                        <ComboboxList>
                          {(folder: string) => (
                            <ComboboxItem key={folder} value={folder}>
                              <Folder size={14} />
                              <span className="break-all">{folder}</span>
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                    <p className="doc-detail-help">
                      {draft.folder.trim() &&
                      !folders.includes(draft.folder.trim())
                        ? "This folder will be created when you save."
                        : "Choose an existing folder or enter a new path."}
                    </p>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-tags`}>Tags</FieldLabel>
                    <div className="doc-detail-tags">
                      {draft.tags.filter(Boolean).map((tag, index) => (
                        <Badge variant="secondary" key={`${tag}-${index}`}>
                          <span>{tag}</span>
                          <button
                            type="button"
                            aria-label={`Remove tag ${tag}`}
                            onClick={() =>
                              update(
                                "tags",
                                draft.tags.filter((_, i) => i !== index)
                              )
                            }
                          >
                            <X size={12} />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <Input
                      id={`${id}-tags`}
                      value={tagInput}
                      list={`${id}-tag-options`}
                      placeholder="Add a tag…"
                      onChange={(event) => setTagInput(event.target.value)}
                      onBlur={addTags}
                      onKeyDown={(event) => {
                        if (
                          (event.key === "Enter" || event.key === ",") &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault()
                          addTags()
                        }
                      }}
                    />
                    <datalist id={`${id}-tag-options`}>
                      {suggestedTags.map((tag) => (
                        <option key={tag} value={tag} />
                      ))}
                    </datalist>
                    <p className="doc-detail-help">Press Enter to add a tag.</p>
                  </Field>
                </fieldset>
              </form>
            </TabsContent>
          </Tabs>
        </div>
        <DrawerFooter className="doc-detail-footer">
          {error && (
            <p className="doc-detail-error" role="alert">
              {error}
            </p>
          )}
          <div className="doc-detail-footer-row">
            <span className="doc-detail-save-state" role="status">
              {busy
                ? "Saving…"
                : dirty
                  ? "Unsaved changes"
                  : pending
                    ? "Review the information before filing."
                    : "All changes saved"}
            </span>
            <div className="doc-detail-footer-actions">
              <DrawerClose
                render={<Button variant="ghost" size="lg" />}
                disabled={busy}
              >
                {dirty ? "Cancel" : "Close"}
              </DrawerClose>
              {pending && dirty && (
                <Button
                  variant="outline"
                  size="lg"
                  disabled={busy || processing}
                  onClick={() => save()}
                >
                  Save
                </Button>
              )}
              <Button
                size="lg"
                disabled={busy || processing || (!pending && !dirty)}
                onClick={() => save(pending)}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : pending ? (
                  <Check />
                ) : null}
                {pending ? "Approve and file" : "Save"}
              </Button>
            </div>
          </div>
        </DrawerFooter>
        <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Discard changes?</DialogTitle>
              <DialogDescription>
                Your changes have not been saved yet.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmClose(false)}>
                Continue editing
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setConfirmClose(false)
                  setOpen(false)
                }}
              >
                Discard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DrawerContent>
    </Drawer>
  )
}
