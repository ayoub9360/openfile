import { test, expect } from "@playwright/test"
import { createFixture } from "../src/infrastructure/fixtures"

test("all workspace pages and shared dialogs use English", async ({ page }) => {
  const state = createFixture()
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "english",
          userId: "english",
          expiresAt: "2099-01-01T00:00:00Z",
        },
        user: {
          id: "english",
          name: state.settings.name,
          email: state.settings.email,
        },
      },
    })
  )
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: state })
  )
  await page.route("**/api/integrations", (route) =>
    route.fulfill({
      json: {
        ai: {
          provider: "openai",
          enabled: false,
          hasApiKey: false,
          model: "gpt-4.1-mini",
          embeddingModel: "text-embedding-3-small",
        },
        connectors: {
          localFolder: "Documents",
          driveFolder: "Open File",
          googleConfigured: false,
          driveConnected: false,
        },
      },
    })
  )
  for (const [path, heading] of [
    ["/", "Library"],
    ["/library", "Library"],
    ["/search", "The answer is in there somewhere. Let's find it together."],
    ["/collections", "Things that belong together"],
    ["/connectors", "Your documents, without borders"],
    ["/history", "History"],
    ["/settings", "A workspace of your own"],
  ]) {
    await page.goto(path!)
    await expect(
      page.getByRole("heading", { name: heading!, exact: true })
    ).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    const copy = await page.locator("body").innerText()
    expect(copy).not.toMatch(
      /Bibliothèque|Paramètres|Chargement|Émetteur|électricité|émetteur|\bIA\b|\bKo\b|\bMo\b/
    )
  }
  await expect(
    page.getByText("{date}, {type}, {issuer}", { exact: false })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Import a document", exact: true })
    .click()
  await expect(
    page.getByRole("dialog", { name: "Import a document" })
  ).toBeVisible()
  await expect(page.getByLabel("Import steps")).toContainText("2. Analysis")
  await expect(
    page.getByText("Automatic analysis is not enabled")
  ).toBeVisible()
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await page.goto("/collections")
  await page
    .getByRole("button", { name: "Create a collection", exact: true })
    .click()
  await expect(
    page.getByRole("dialog", { name: "Create a collection" })
  ).toBeVisible()
  await expect(page.getByLabel("Associated tags")).toBeVisible()
})
