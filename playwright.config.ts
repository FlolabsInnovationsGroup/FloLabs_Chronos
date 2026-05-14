import { defineConfig, devices } from "@playwright/test";

const externalBase = process.env.PLAYWRIGHT_BASE_URL?.trim().replace(/\/$/, "");
const port = Number(process.env.PORT ?? 3000);
const localBase = `http://localhost:${port}`;

/** In CI (or when PLAYWRIGHT_BASE_URL is set) hit the deployed surface directly. */
const baseURL = externalBase ?? localBase;
const isExternal = Boolean(externalBase);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(!isExternal && {
    webServer: {
      /** `/` redirects (307); Playwright waits for a 2xx on this URL. */
      command: "pnpm exec next dev -p " + port,
      url: `${localBase}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  }),
});
