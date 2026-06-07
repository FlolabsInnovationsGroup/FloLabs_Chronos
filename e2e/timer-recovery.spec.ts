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

type ActiveTimerResponse = {
  timer?: {
    userId?: string;
    startedAt?: number;
    description?: string;
    projectId?: string | null;
  } | null;
};

let suitePass = true;
test.afterEach(({}, info) => { if ((info.status === "failed" || info.status === "timedOut") && info.retry >= info.project.retries) suitePass = false; });
test.afterAll(async () => { await markStory(STORIES.SSE_RECONNECT, suitePass); });

test.describe("Production — /api/timer/active DB fallback path", () => {
  test.skip(!firstUser, "No test accounts found in test_assets/test_users.json");

  test("/api/timer/active returns running state after start, and null/empty after stop", async ({ page }) => {
    test.setTimeout(120_000);

    const [email] = extractEmails(firstUser!);
    test.skip(!email, "Test user has no email configured");

    await signInProduction(page, email!, firstUser!.password);
    await expect(page.getByPlaceholder("What are you working on?")).toBeVisible({ timeout: 90_000 });

    // Ensure no stale timer first
    const stopIfPresent = page.getByRole("button", { name: /stop session/i });
    if (await stopIfPresent.isVisible().catch(() => false)) {
      await stopIfPresent.click();
      await expect(page.getByRole("button", { name: /start session/i })).toBeVisible({ timeout: 60_000 });
    }

    // Pre-condition: /api/timer/active should return null or empty before starting
    const beforeRes = await page.request.get("/api/timer/active");
    expect(
      beforeRes.status(),
      `/api/timer/active pre-start returned unexpected status ${beforeRes.status()}`
    ).toBeGreaterThanOrEqual(200);
    // We only require it does not 500 before the timer starts
    expect(beforeRes.status()).toBeLessThan(500);

    // Start a timer (description + project so stop button is enabled)
    const description = `E2E timer-recovery — ${new Date().toISOString()}`;
    await page.getByPlaceholder("What are you working on?").fill(description);

    const projectButton = page.getByRole("button", { name: /select project/i }).first();
    await expect(projectButton).toBeVisible({ timeout: 30_000 });
    await projectButton.click();
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible({ timeout: 30_000 });
    await options.first().click();

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

    // Query /api/timer/active — must return a running timer with a numeric startedAt
    const activeRes = await page.request.get("/api/timer/active");
    expect(activeRes.status(), `/api/timer/active returned ${activeRes.status()} after start`).toBe(200);

    const activeBody = (await activeRes.json()) as ActiveTimerResponse;
    const activeTimer = activeBody?.timer;
    expect(activeTimer, "/api/timer/active must return a non-null timer when running").not.toBeNull();
    expect(typeof activeTimer?.startedAt, "startedAt must be a number").toBe("number");
    expect(activeTimer?.startedAt).toBeGreaterThan(0);
    expect(typeof activeTimer?.userId, "userId must be a string").toBe("string");

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

    // /api/timer/active must now return null or an empty object
    const afterRes = await page.request.get("/api/timer/active");
    expect(afterRes.status(), `/api/timer/active returned ${afterRes.status()} after stop`).toBe(200);

    const afterBody = await afterRes.json() as ActiveTimerResponse;
    const isNullOrEmpty =
      afterBody === null ||
      afterBody === undefined ||
      afterBody?.timer === null ||
      afterBody?.timer === undefined;
    expect(
      isNullOrEmpty,
      `/api/timer/active should return null/empty after stop, got: ${JSON.stringify(afterBody)}`
    ).toBeTruthy();

    // Clean up: delete the created entry so no E2E remnants remain
    await page.evaluate(async (desc) => {
      const r = await fetch("/api/entries?limit=50");
      const d = await r.json();
      const entry = (d.entries ?? []).find((e: { description: string; id: string }) => e.description === desc);
      if (entry) await fetch(`/api/entries/${entry.id}`, { method: "DELETE" });
    }, description);
  });
});
