import { test } from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  AssistantText,
  AssistantFiles,
  AssistantActivity,
} from "../presentation/components/assistant-response"
import { describeOperation } from "./assistant-display"
import type { Citation, ToolRecord } from "@open-file/core/assistant"
const source: Citation = {
  reference: "S1",
  id: "lease",
  name: "Lease.pdf",
  excerpt: "Three months",
  version: "v1",
}
test("document citations render inside formatted text; HTML, external images and fabricated citations stay inert", () => {
  const html = renderToStaticMarkup(
    createElement(AssistantText, {
      text: "**Notice**: three months [S1]. Unknown [S99].\n\n- Item\n\n`[S1]`\n\n![image](https://untrusted.example/track)\n\n<script>alert(1)</script>",
      sources: [source],
      onOpen: () => {},
    })
  )
  assert.match(html, /<strong>Notice<\/strong>/)
  assert.match(html, /Open source S1: Lease.pdf/)
  assert.match(html, /<li>Item<\/li>/)
  assert.match(html, /<code>\[S1\]<\/code>/)
  assert.match(html, /\[S99\]/)
  assert.doesNotMatch(html, /<script|<img|untrusted.example/)
})
test("file cards use the authenticated preview endpoint and include file metadata", () => {
  const html = renderToStaticMarkup(
    createElement(AssistantFiles, {
      documents: [
        {
          id: "a/b",
          name: "Lease.pdf",
          folder: "Home",
          storage: "Local",
          mimeType: "application/pdf",
          size: "2 KB",
          date: "2026-01-01",
          version: "v1",
        },
      ],
      onOpen: () => {},
    })
  )
  assert.match(html, /\/api\/documents\/a%2Fb\/preview/)
  assert.match(html, /Open file Lease.pdf/)
  assert.match(html, /Home/)
})
test("activity exposes actual counts, partial results and user-facing intent", () => {
  const count: ToolRecord = {
    id: "count",
    name: "countDocuments",
    input: {
      filter: { folder: "Home", includeSubfolders: false },
      intent: "Je compte les fichiers du dossier.",
    },
    output: { count: 12 },
    status: "complete",
  }
  assert.equal(
    describeOperation(count).title,
    "Je compte les fichiers du dossier."
  )
  assert.match(
    describeOperation(count).detail,
    /12 files in Home · direct files only/
  )
  assert.match(
    describeOperation({
      id: "find",
      name: "findDocuments",
      input: {},
      output: { total: 42, documents: [{ id: "lease" }], nextOffset: 1 },
      status: "complete",
    }).detail,
    /1 of 42 matching files · more available/
  )
  const html = renderToStaticMarkup(
    createElement(AssistantActivity, {
      message: {
        id: "answer",
        role: "assistant",
        text: "",
        sources: [],
        tools: [count],
        status: "running",
      },
      onOpen: () => {},
    })
  )
  assert.match(html, /Je compte les fichiers/)
  assert.match(html, /12 files in Home/)
  assert.match(html, /Preparing your answer/)
})
