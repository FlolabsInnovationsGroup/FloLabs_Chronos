import { defineConfig, devices } from "@playwright/test";

/**
 * Production-only E2E (no local dev server).
 * Prefer `PLAYWRIGHT_BASE_URL` (e.g. your public NEXTAUTH_URL / production domain).
 *
 * Run: `pnpm run test:e2e:production`
 */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://athensgreecemarathon.com";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
