import { defineConfig } from "@playwright/test"
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000"
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev --hostname 0.0.0.0 --port 3000",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120000,
      },
})
