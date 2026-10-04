import { test, expect } from "@playwright/test"
import { createFixture } from "../src/infrastructure/fixtures"

test("collections support creating, editing and reopening multi-tag groups", async ({
  page,
}) => {
  const state = createFixture()
  state.documents = [
    {
      ...state.documents[0]!,
      id: "home",
      name: "Home.pdf",
      status: "filed",
      tags: ["Home"],
    },
    {
      ...state.documents[0]!,
      id: "work",
      name: "Work.pdf",
      status: "filed",
      tags: ["Work"],
    },
    {
      ...state.documents[0]!,
      id: "pending",
      name: "Pending.pdf",
      status: "pending",
      tags: ["Home"],
    },
    {
      ...state.documents[0]!,
      id: "archived",
      name: "Archived.pdf",
      status: "archived",
      tags: ["Home"],
    },
  ]
  state.collections = [
    {
      id: "legacy",
      name: "Existing",
      description: "",
      tag: "Home",
      color: "sage",
    },
  ]
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "collections",
          userId: "collections",
          expiresAt: "2099-01-01T00:00:00Z",
        },
        user: {
          id: "collections",
          name: state.settings.name,
          email: state.settings.email,
        },
      },
    })
  )
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: state })
  )
  await page.route("**/api/collections", async (route) => {
    const saved = route.request().postDataJSON()
    state.collections = [
      ...state.collections.filter((c) => c.id !== saved.id),
      saved,
    ]
    await route.fulfill({ json: state })
  })
  await page.goto("/collections")
  await expect(
    page.getByText("Tags connect your documents to collections")
  ).toHaveCount(0)
  const existing = page.getByRole("region", { name: "Existing", exact: true })
  await expect(existing).toContainText("1 document")
  await page.getByRole("button", { name: "Edit Existing" }).click()
  const dialog = page.getByRole("dialog")
  await expect(
    dialog.getByRole("button", { name: "Remove tag Home" })
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Work", exact: true }).click()
  await expect(
    dialog.getByText("2 filed documents match", { exact: false })
  ).toBeVisible()
  await dialog.getByRole("button", { name: "Save changes" }).click()
  await expect(existing).toContainText("2 documents")
  await existing.getByRole("link", { name: "View documents" }).click()
  await expect(
    page.getByRole("heading", { name: "Existing", exact: true })
  ).toBeVisible()
  await expect(page.getByText("Home.pdf", { exact: true })).toBeVisible()
  await expect(page.getByText("Work.pdf", { exact: true })).toBeVisible()
  await expect(page.getByText("Pending.pdf", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Archived.pdf", { exact: true })).toHaveCount(0)
  await page.goto("/collections")
  await page.getByRole("button", { name: "Edit Existing" }).click()
  await dialog.getByRole("button", { name: "Remove tag Home" }).click()
  await dialog.getByRole("button", { name: "Remove tag Work" }).click()
  await expect(
    dialog.getByRole("button", { name: "Save changes" })
  ).toBeDisabled()
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(existing).toContainText("2 documents")
  await page.getByRole("button", { name: "Edit Existing" }).click()
  await dialog.getByRole("button", { name: "Remove tag Home" }).click()
  await dialog.getByRole("button", { name: "Save changes" }).click()
  await page.reload()
  await expect(existing).toContainText("1 document")
  await existing.getByRole("link", { name: "View documents" }).click()
  await expect(page.getByText("Work.pdf", { exact: true })).toBeVisible()
  await expect(page.getByText("Home.pdf", { exact: true })).toHaveCount(0)
  await page.goto("/collections")
  await page
    .getByRole("button", { name: "Create a collection", exact: true })
    .click()
  await dialog.getByLabel("Name", { exact: true }).fill("New trip")
  await dialog.getByLabel("Associated tags").fill("Travel")
  await dialog.getByRole("button", { name: "Add tag" }).click()
  await dialog.getByRole("button", { name: "Home", exact: true }).click()
  await dialog
    .getByRole("button", { name: "Create collection", exact: true })
    .click()
  const created = page.getByRole("region", { name: "New trip", exact: true })
  await expect(created).toContainText("Travel")
  await expect(created).toContainText("Home")
  await expect(created).toContainText("1 document")
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "Edit New trip" }).click()
  await expect(
    dialog.getByRole("button", { name: "Save changes" })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
})
