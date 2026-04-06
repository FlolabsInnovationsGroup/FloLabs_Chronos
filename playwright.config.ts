import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
/** Must match NEXTAUTH_URL host (usually `localhost`, not 127.0.0.1) or sign-in cookies won’t apply. */
const baseURL = `http://localhost:${port}`;

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
  webServer: {
    /** `/` redirects (307); Playwright waits for a 2xx on this URL. */
    command: "pnpm exec next dev -p " + port,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
