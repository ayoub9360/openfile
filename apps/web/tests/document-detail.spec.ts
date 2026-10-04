import { test, expect } from "@playwright/test"
import type { Document, Workspace } from "../src/domain/workspace"

for (const width of [1440, 390]) {
  test(`document drawer: edits, favorites, dismissal and preview at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    const document: Document = {
      id: "drawer-test",
      name: "2026-02_Payslip.pdf",
      originalName: "Payslip — February 2026.pdf",
      kind: "Document",
      issuer: "Example Studio",
      date: "2026-02-28",
      storage: "Local",
      folder: "Documents/Work/Salaries",
      tags: ["Salary", "2026"],
      status: "filed",
      confidence: 95,
      favorite: false,
      size: "124 KB",
      content: "Payslip\nPeriod: February 2026\nExample Studio",
      summary:
        "February 2026 payslip issued by Example Studio. This document summarizes earnings and contributions for the month.",
      processing: "ready",
      revision: 1,
    }
    const state: Workspace = {
      version: 1,
      documents: [document],
      connectors: [],
      collections: [],
      activities: [],
      settings: {
        name: "Test",
        email: "test@example.com",
        naming: "",
        review: true,
        notifications: false,
      },
    }
    let saves = 0
    let failSave = false
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({
        json: {
          session: {
            id: "drawer-session",
            userId: "drawer-user",
            expiresAt: "2099-01-01T00:00:00Z",
          },
          user: { id: "drawer-user", name: "Test", email: "test@example.com" },
        },
      })
    )
    await page.route("**/api/workspace", (route) =>
      route.fulfill({ json: state })
    )
    await page.route("**/api/documents/drawer-test/favorite", (route) => {
      document.favorite = !document.favorite
      document.revision!++
      return route.fulfill({ json: state })
    })
    await page.route("**/api/documents/drawer-test", (route) => {
      if (failSave)
        return route.fulfill({
          status: 500,
          json: { error: "Simulated save failure" },
        })
      const body = route.request().postDataJSON()
      expect(body.document.revision).toBe(document.revision)
      Object.assign(document, body.document, {
        revision: document.revision! + 1,
      })
      saves++
      return route.fulfill({ json: state })
    })
    await page.goto(
      `/library?folder=${encodeURIComponent(document.folder)}&storage=Local`
    )
    await page.getByRole("button", { name: /^2026-02_Payslip.pdf/ }).click()
    const drawer = page.getByRole("dialog").first()
    await expect(drawer.getByLabel("File name", { exact: true })).toHaveValue(
      document.name
    )
    await expect(
      drawer.getByRole("button", { name: "Save", exact: true })
    ).toBeDisabled()
    await drawer.evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished)
      )
    )
    await page.screenshot({
      path: testInfo.outputPath(`drawer-${width}.png`),
      animations: "disabled",
    })
    expect(
      await page.evaluate(
        () => window.document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)

    if (width < 768) {
      await drawer.getByRole("tab", { name: "Preview", exact: true }).click()
      await expect(drawer.getByLabel("Document preview")).toBeVisible()
      await drawer.getByRole("tab", { name: "Information" }).click()
    }
    await drawer.getByLabel("Issuer", { exact: true }).fill("Updated Studio")
    await drawer.getByRole("button", { name: "Add to favorites" }).click()
    await expect(
      drawer.getByRole("button", { name: "Remove from favorites" })
    ).toHaveAttribute("aria-pressed", "true")
    await expect(drawer.getByLabel("Issuer", { exact: true })).toHaveValue(
      "Updated Studio"
    )
    await drawer.getByRole("tab", { name: "Extracted text" }).click()
    await expect(drawer.locator(".doc-detail-text")).toContainText("Payslip")
    await drawer.getByRole("tab", { name: "Information" }).click()
    await expect(drawer.getByLabel("Issuer", { exact: true })).toHaveValue(
      "Updated Studio"
    )

    await drawer.getByRole("button", { name: "Close document details" }).click()
    const confirmation = page.getByRole("dialog", {
      name: "Discard changes?",
    })
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole("button", { name: "Continue editing" }).click()
    await expect(confirmation).toHaveCount(0)
    await drawer
      .getByLabel("Destination folder", { exact: true })
      .fill("Documents/Work")
    await page
      .getByRole("option", { name: "Documents/Work", exact: true })
      .click()
    await expect(
      drawer.getByLabel("Destination folder", { exact: true })
    ).toHaveValue("Documents/Work")
    await drawer.getByRole("button", { name: "Remove tag 2026" }).click()
    await drawer.getByLabel("Tags", { exact: true }).fill("Verified")
    await page.keyboard.press("Enter")
    await expect(
      drawer.getByRole("button", { name: "Remove tag Verified" })
    ).toBeVisible()
    failSave = true
    await drawer.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByText("Simulated save failure")).toBeVisible()
    await expect(drawer.getByLabel("Issuer", { exact: true })).toHaveValue(
      "Updated Studio"
    )
    failSave = false
    await drawer.getByRole("button", { name: "Save", exact: true }).click()
    await expect(drawer).toHaveCount(0)
    expect(saves).toBe(1)
    expect(document.favorite).toBe(true)
    expect(document.tags).toEqual(["Salary", "Verified"])
    expect(document.folder).toBe("Documents/Work")
    expect(document.issuer).toBe("Updated Studio")
    await page.goto(
      `/library?folder=${encodeURIComponent(document.folder)}&storage=Local`
    )
    await page.getByRole("button", { name: /^2026-02_Payslip.pdf/ }).click()
    await drawer.getByLabel("File name", { exact: true }).fill("")
    await drawer.getByRole("tab", { name: "Extracted text" }).click()
    await drawer.getByRole("button", { name: "Save", exact: true }).click()
    await expect(drawer.getByRole("alert")).toBeVisible()
    await expect(drawer.getByLabel("File name", { exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(confirmation).toBeVisible()
    await confirmation
      .getByRole("button", { name: "Discard", exact: true })
      .click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    expect(saves).toBe(1)
    expect(document.name).toBe("2026-02_Payslip.pdf")
    expect(errors).toEqual([])
  })
}
