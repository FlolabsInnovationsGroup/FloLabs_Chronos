import { expect, test } from "@playwright/test";
import { extractEmails, loadTestUsers, signInProduction } from "./lib/production-auth";
import { markStory } from "./lib/notion-reporter";
import { STORIES } from "./lib/story-ids";

const users = loadTestUsers();
const firstUser = users.find(
  (u) =>
    u.role.toLowerCase().includes("human") ||
    u.role.toLowerCase() === "admin" ||
    u.role.toLowerCase() === "member"
) ?? users[0];

let suitePass = true;
test.afterEach(({}, info) => { if ((info.status === "failed" || info.status === "timedOut") && info.retry >= info.retries) suitePass = false; });
test.afterAll(async () => { await markStory(STORIES.TOPBAR_PERSISTENCE, suitePass); });

test.describe("Production — TopBar live timer duration display", () => {
  test.skip(!firstUser, "No test accounts found in test_assets/test_users.json");

  test("TopBar shows HH:MM:SS while a session is running, disappears after stop, and entry appears in last-7-days", async ({ page }) => {
    test.setTimeout(120_000);

    const [email] = extractEmails(firstUser!);
    test.skip(!email, "Test user has no email configured");

    await signInProduction(page, email!, firstUser!.password);
    await expect(page.getByPlaceholder("What are you working on?")).toBeVisible({ timeout: 90_000 });

    // Ensure no stale active timer from a previous run
    const stopIfPresent = page.getByRole("button", { name: /stop session/i });
    if (await stopIfPresent.isVisible().catch(() => false)) {
      await stopIfPresent.click();
      await expect(page.getByRole("button", { name: /start session/i })).toBeVisible({ timeout: 60_000 });
    }

    // Fill description and select first project so the stop button is enabled
    const description = `E2E TopBar duration — ${new Date().toISOString()}`;
    await page.getByPlaceholder("What are you working on?").fill(description);

    const projectButton = page.getByRole("button", { name: /select project/i }).first();
    await expect(projectButton).toBeVisible({ timeout: 30_000 });
    await projectButton.click();
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible({ timeout: 30_000 });
    await options.first().click();

    // Start the session
    const startResponsePromise = page.waitForResponse(
      (r) => {
        try {
          const u = new URL(r.url());
          return u.pathname === "/api/timer/start" && r.request().method() === "POST";
        } catch {
          return false;
        }
      },
      { timeout: 60_000 }
    );
    await page.getByRole("button", { name: /start session/i }).click();
    const startResponse = await startResponsePromise;
    expect(startResponse.ok(), `/api/timer/start returned ${startResponse.status()}`).toBeTruthy();

    // Wait 2–3 s so the clock ticks at least once
    await page.waitForTimeout(2_500);

    // Assert that HH:MM:SS is visible in the header/banner landmark
    const durationInHeader = page.locator("header").getByText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(durationInHeader).toBeVisible({ timeout: 30_000 });

    // Navigate to /reports — duration must still be visible in the header
    await page.goto("/reports", { waitUntil: "domcontentloaded" });
    await expect(page.locator("header").getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeVisible({ timeout: 30_000 });

    // Navigate back to /timer
    await page.goto("/timer", { waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("What are you working on?")).toBeVisible({ timeout: 60_000 });

    // Stop the session
    const stopResponsePromise = page.waitForResponse(
      (r) => {
        try {
          const u = new URL(r.url());
          return u.pathname === "/api/timer/stop" && r.request().method() === "POST";
        } catch {
          return false;
        }
      },
      { timeout: 60_000 }
    );
    await page.getByRole("button", { name: /stop session/i }).click();
    const stopResponse = await stopResponsePromise;
    expect(stopResponse.ok(), `/api/timer/stop returned ${stopResponse.status()}`).toBeTruthy();

    // Duration text must disappear from the header after stop
    await expect(page.locator("header").getByText(/^\d{2}:\d{2}:\d{2}$/)).toBeHidden({ timeout: 30_000 });

    // Stopped entry must appear in the "Last 7 Days" section
    await expect(page.getByText(description)).toBeVisible({ timeout: 60_000 });

    // Clean up: delete the created entry so no E2E remnants remain
    await page.evaluate(async (desc) => {
      const r = await fetch("/api/entries?limit=50");
      const d = await r.json();
      const entry = (d.entries ?? []).find((e: { description: string; id: string }) => e.description === desc);
      if (entry) await fetch(`/api/entries/${entry.id}`, { method: "DELETE" });
    }, description);
  });
});
