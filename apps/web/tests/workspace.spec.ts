import { test, expect } from "@playwright/test"
import { randomUUID } from "node:crypto"

test("account, upload, worker, filing, search, and persistence", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/")
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click()
  await page.getByLabel("Your name").fill("Browser test")
  await page
    .getByLabel("Email address")
    .fill(`e2e-${randomUUID()}@openfile-test.invalid`)
  await page.getByLabel("Password").fill(randomUUID())
  await page.getByLabel("Invitation code").fill(process.env.SIGNUP_TOKEN ?? "")
  await page.getByRole("button", { name: "Create my account" }).click()
  await expect(
    page.getByRole("button", { name: "User menu for Browser test" })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Import a document", exact: true })
    .first()
    .click()
  await page.getByLabel("Choose files").setInputFiles({
    name: "invoice-orchidee.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "ORCHIDEE invoice for 150 euros for an internet subscription in February 2026."
    ),
  })
  await page
    .getByRole("button", { name: "Import without AI", exact: true })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByLabel("File name")).toBeVisible({
    timeout: 30000,
  })
  await expect(page.getByText("Manual filing", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Inbox", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("link", { name: "Automations", exact: true })
  ).toHaveCount(0)
  const before = await (await page.request.get("/api/workspace")).json()
  expect(before).not.toHaveProperty("rules")
  expect(before.documents[0].status).toBe("pending")
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("File name").fill("2026_invoice_orchidee.txt")
  await dialog
    .getByLabel("Destination folder", { exact: true })
    .fill("Documents/Invoices/2026")
  await dialog.getByRole("button", { name: "Approve and file" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/folder=Documents/)
  await expect(
    page.getByRole("button", { name: /2026_invoice_orchidee.txt/ }).first()
  ).toBeVisible()
  await page.goto("/library")
  await page
    .getByRole("button", {
      name: "Open folder Documents (Local)",
      exact: true,
    })
    .click()
  await page
    .getByRole("button", {
      name: "Open folder Invoices (Local)",
      exact: true,
    })
    .click()
  await page
    .getByRole("button", {
      name: "Open folder 2026 (Local)",
      exact: true,
    })
    .click()
  await expect(
    page.getByRole("button", { name: /2026_invoice_orchidee.txt/ }).first()
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole("button", { name: /2026_invoice_orchidee.txt/ }).first()
  ).toBeVisible()
  await page.getByRole("button", { name: /^2026_invoice_orchidee.txt/ }).click()
  await page.getByRole("button", { name: "More actions" }).click()
  await page.getByRole("menuitem", { name: "Suggest a new filing" }).click()
  await expect(page.getByRole("dialog").getByLabel("File name")).toBeVisible({
    timeout: 30000,
  })
  await page
    .getByRole("dialog")
    .getByLabel("Destination folder", { exact: true })
    .fill("Documents/Invoices/Verified")
  await page.getByRole("button", { name: "Approve and file" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page).toHaveURL(/folder=Documents/)
  await page.goto("/search")
  await page.getByRole("textbox").fill("ORCHIDEE")
  await page.getByRole("button", { name: "Send question" }).click()
  await expect(
    page.getByText(/AI disabled: here are the passages/)
  ).toBeVisible()
  await page.goto("/settings")
  await expect(page.getByLabel("OpenAI API key")).toBeVisible()
  await expect(
    page.getByText("AI disabled — manual filing", { exact: true })
  ).toBeVisible()
  await page.getByRole("radio", { name: /Automatically with AI/ }).check()
  await expect(page.getByText("Mode change not saved.")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Save and enable AI" })
  ).toBeDisabled()
  await page.getByRole("radio", { name: /Manually, without AI/ }).check()
  await page.getByLabel("Local folder", { exact: true }).fill("My documents")
  await page.getByRole("button", { name: "Save integrations" }).click()
  await expect(
    page.getByText("Integrations saved", { exact: true })
  ).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Local folder", { exact: true })).toHaveValue(
    "My documents"
  )
  await page.screenshot({ path: "test-results/settings.png", fullPage: true })
  await page.getByRole("button", { name: "User menu for Browser test" }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true })
  ).toBeVisible()
  expect(errors).toEqual([])
})
test("authentication is readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: "test-results/auth-mobile.png",
    fullPage: true,
  })
})

test("mobile flow: blocking import, recovery, and approval (mock API contract)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const fixture = {
    id: "test-import",
    name: "original.txt",
    originalName: "original.txt",
    kind: "Certificate",
    issuer: "Company",
    date: "2026-10-03",
    storage: "Local",
    folder: "Documents/Work",
    tags: [],
    status: "pending",
    confidence: 95,
    favorite: false,
    size: "1 KB",
    content: "Salary certificate",
    summary: "Salary certificate",
    processing: "processing",
    processingError: undefined as string | undefined,
    analysisMode: "ai",
    revision: 1,
  }
  let polls = 0
  let retried = false
  let uploads = 0
  const state = {
    version: 1,
    documents: [] as (typeof fixture)[],
    connectors: [
      {
        id: "local",
        name: "Local folders",
        connected: true,
        folder: "Documents",
      },
    ],
    collections: [],
    activities: [],
    settings: {
      name: "Test",
      email: "test@example.com",
      naming: "{date}_{type}",
      review: true,
      notifications: false,
    },
  }
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "test-session",
          userId: "test-user",
          expiresAt: "2099-01-01T00:00:00Z",
        },
        user: { id: "test-user", name: "Test", email: "test@example.com" },
      },
    })
  )
  await page.route("**/api/integrations", (route) =>
    route.fulfill({
      json: { ai: { enabled: true, hasApiKey: true }, connectors: {} },
    })
  )
  await page.route("**/api/workspace", (route) => {
    if (
      state.documents.length &&
      fixture.processing === "processing" &&
      ++polls >= 2
    ) {
      if (!retried) {
        fixture.processing = "failed"
        fixture.processingError =
          "OpenAI rejected the saved API key. Replace it in settings."
        return route.fulfill({ json: state })
      }
      fixture.processing = "ready"
      fixture.name = "2026_Certificate_salary.txt"
      fixture.revision = 2
    }
    return route.fulfill({ json: state })
  })
  await page.route("**/api/documents", (route) => {
    uploads++
    state.documents.push(
      {
        ...fixture,
        id: "existing",
        name: "Old invoice.txt",
        status: "archived",
        processing: "ready",
        folder: "Documents/Finances/Invoices",
      },
      fixture
    )
    return route.fulfill({
      json: { state, documentIds: [fixture.id], errors: [] },
    })
  })
  await page.route("**/api/documents/test-import/retry", (route) => {
    retried = true
    polls = 0
    fixture.processing = "processing"
    fixture.processingError = undefined
    return route.fulfill({ json: state })
  })
  await page.route("**/api/documents/test-import", (route) => {
    const body = route.request().postDataJSON()
    Object.assign(fixture, body.document, {
      status: body.approve ? "filed" : "pending",
    })
    return route.fulfill({ json: state })
  })
  await page.goto("/library")
  await page
    .getByRole("button", { name: "Import a document", exact: true })
    .first()
    .click()
  await page.getByLabel("Choose files").setInputFiles({
    name: "original.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Salary certificate"),
  })
  await page
    .getByRole("button", { name: "Import and analyze", exact: true })
    .click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(
    page.getByText("Reading and preparing the filing…")
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByRole("alert")).toContainText(
    "OpenAI rejected the saved API key",
    { timeout: 15000 }
  )
  await expect(page.getByLabel("File name")).toHaveCount(0)
  await page.getByRole("button", { name: "Retry analysis" }).click()
  await expect(page.getByLabel("File name")).toHaveValue(
    "2026_Certificate_salary.txt",
    { timeout: 15000 }
  )
  await expect(
    page.getByLabel("Destination folder", { exact: true })
  ).toHaveValue("Documents/Work")
  await expect(
    page.getByText("New folder suggested", { exact: true })
  ).toBeVisible()
  await expect(
    page
      .getByLabel("Destination folder tree")
      .getByText("To be created", { exact: true })
  ).toHaveCount(1)
  await page
    .getByRole("combobox", { name: "Or choose an existing folder" })
    .click()
  await page
    .getByRole("option", { name: "Documents/Finances", exact: true })
    .click()
  await expect(page.getByText("Existing folder", { exact: true })).toBeVisible()
  await expect(
    page.getByText("New folder suggested", { exact: true })
  ).toHaveCount(0)
  await page
    .getByLabel("Destination folder", { exact: true })
    .fill("Documents/Work/Salaries")
  await expect(
    page
      .getByLabel("Destination folder tree")
      .getByText("To be created", { exact: true })
  ).toHaveCount(2)
  await page
    .getByLabel("Destination folder", { exact: true })
    .fill("Documents/Work")
  await page.screenshot({
    path: "test-results/import-mobile.png",
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => window.document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.getByRole("button", { name: "Resume later" }).click()
  await page.reload()
  await expect(
    page.getByRole("button", { name: /2026_Certificate_salary.txt/ })
  ).toHaveCount(0)
  await page.getByRole("button", { name: "Resume import" }).click()
  await page.getByLabel("File name").fill("Certificate_october.txt")
  await page.getByRole("button", { name: "Approve and file" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: /^Certificate_october.txt/ })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => window.document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  expect(uploads).toBe(1)
  await page.screenshot({
    path: "test-results/library-mobile.png",
    fullPage: true,
  })
})
