import { test, expect } from "@playwright/test"

for (const width of [1440, 390]) {
  test(`history: pagination and search at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({
        json: {
          session: {
            id: "history-session",
            userId: "history-user",
            expiresAt: "2099-01-01T00:00:00Z",
          },
          user: { id: "history-user", name: "Test", email: "test@example.com" },
        },
      })
    )
    await page.route("**/api/workspace", (route) =>
      route.fulfill({
        json: {
          version: 1,
          documents: [],
          connectors: [],
          collections: [],
          settings: {
            name: "Test",
            email: "test@example.com",
            naming: "",
            review: true,
            notifications: false,
          },
          activities: Array.from({ length: 23 }, (_, i) => ({
            id: String(i),
            title: `Action ${i + 1}`,
            detail: `Document ${i + 1} ${"very long detail ".repeat(15)}`,
            date: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
          })),
        },
      })
    )
    await page.goto("/activity")
    await expect(page).toHaveURL(/\/history$/)
    await expect(
      page.getByRole("heading", { name: "History", exact: true })
    ).toBeVisible()
    const rows = page.locator(".activity-row")
    await expect(rows).toHaveCount(10)
    await expect(rows.first()).toContainText("Action 23")
    await expect(
      page.getByRole("button", { name: "Previous page" })
    ).toBeDisabled()
    await page.getByRole("button", { name: "Next page" }).click()
    await expect(rows.first()).toContainText("Action 13")
    await expect(page.getByRole("status")).toHaveText("11–20 of 23 events")
    await page.getByRole("button", { name: "Next page" }).click()
    await expect(rows).toHaveCount(3)
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled()
    await page.getByRole("button", { name: "Previous page" }).click()
    await expect(rows).toHaveCount(10)
    await page.getByLabel("Search history").fill("ACTION 23")
    await expect(rows).toHaveCount(1)
    await expect(page.getByRole("status")).toHaveText("1–1 of 1 event")
    await page.getByLabel("Search history").fill("nonexistent")
    await expect(rows).toHaveCount(0)
    await expect(page.getByText("No results", { exact: true })).toBeVisible()
    await page.getByLabel("Search history").fill("")
    await page.getByRole("combobox", { name: "Per page" }).click()
    await page.getByRole("option", { name: "20", exact: true }).click()
    await expect(rows).toHaveCount(20)
    await page.getByRole("button", { name: "Next page" }).click()
    await page.getByRole("combobox", { name: "Per page" }).click()
    await page.getByRole("option", { name: "50", exact: true }).click()
    await expect(rows).toHaveCount(23)
    await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
  })
}
