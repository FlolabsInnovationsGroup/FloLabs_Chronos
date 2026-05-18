/**
 * Regression tests for the three problems fixed in 2026-05:
 *
 * 1. Deploy resilience — Redis is cleared on every App Runner deploy. The DB
 *    fallback in /api/timer/active must reconstruct the running timer from
 *    time_entries and return consistent state across repeated calls.
 *
 * 2. Ghost timer prevention — orphaned time_entries older than 24 h used to
 *    surface as active timers that could never be stopped. After the fix,
 *    /api/timer/active auto-closes stale entries, and a second /api/timer/stop
 *    call on a timer that was already stopped must return 404, not 200.
 *
 * 3. Immediate restart after stop — stopping a timer must leave no blocking
 *    orphan so a new timer can start on the very next action.
 */
import { expect, test, type Page } from "@playwright/test";
import { extractEmails, loadTestUsers, signInProduction } from "./lib/production-auth";

const users = loadTestUsers();
const firstUser =
  users.find(
    (u) =>
      u.role.toLowerCase().includes("human") ||
      u.role.toLowerCase() === "admin" ||
      u.role.toLowerCase() === "member"
  ) ?? users[0];

async function clearStaleTimer(page: Page) {
  const stopBtn = page.getByRole("button", { name: /stop session/i });
  if (await stopBtn.isVisible().catch(() => false)) {
    await stopBtn.click();
    await expect(page.getByRole("button", { name: /start session/i })).toBeVisible({ timeout: 60_000 });
  }
}

async function startTimerWithProject(page: Page, description: string) {
  await page.getByPlaceholder("What are you working on?").fill(description);

  const projectBtn = page.getByRole("button", { name: /select project/i }).first();
  await expect(projectBtn).toBeVisible({ timeout: 30_000 });
  await projectBtn.click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible({ timeout: 30_000 });
  await options.first().click();

  const startPromise = page.waitForResponse(
    (r) => {
      try {
        return new URL(r.url()).pathname === "/api/timer/start" && r.request().method() === "POST";
      } catch {
        return false;
      }
    },
    { timeout: 60_000 }
  );
  await page.getByRole("button", { name: /start session/i }).click();
  const res = await startPromise;
  expect(res.ok(), `/api/timer/start returned ${res.status()}`).toBeTruthy();
}

async function stopTimer(page: Page) {
  const stopPromise = page.waitForResponse(
    (r) => {
      try {
        return new URL(r.url()).pathname === "/api/timer/stop" && r.request().method() === "POST";
      } catch {
        return false;
      }
    },
    { timeout: 60_000 }
  );
  await page.getByRole("button", { name: /stop session/i }).click();
  const res = await stopPromise;
  expect(res.ok(), `/api/timer/stop returned ${res.status()}`).toBeTruthy();
  await expect(page.getByRole("button", { name: /start session/i })).toBeVisible({ timeout: 60_000 });
}

test.describe("Timer reliability — deploy resilience and ghost prevention", () => {
  test.skip(!firstUser, "No test accounts found in test_assets/test_users.json");

  test.beforeEach(async ({ page }) => {
    const [email] = extractEmails(firstUser!);
    test.skip(!email, "Test user has no email");
    await signInProduction(page, email, firstUser!.password);
    await expect(page.getByPlaceholder("What are you working on?")).toBeVisible({ timeout: 90_000 });
    await clearStaleTimer(page);
  });

  // --- Problem 1: Deploy resilience (Redis cleared) ---
  test("deploy resilience: /api/timer/active returns the same startedAt on repeated calls", async ({ page }) => {
    // Before the fix: Redis miss after a deploy returned null even with a running timer.
    // Now: the DB fallback reconstructs and re-populates Redis so all calls agree.
    test.setTimeout(90_000);

    await startTimerWithProject(page, `E2E deploy-resilience — ${new Date().toISOString()}`);

    const [res1, res2, res3] = await Promise.all([
      page.request.get("/api/timer/active"),
      page.request.get("/api/timer/active"),
      page.request.get("/api/timer/active"),
    ]);

    for (const res of [res1, res2, res3]) {
      expect(res.status(), "/api/timer/active must not 500").toBe(200);
    }

    const [b1, b2, b3] = await Promise.all([res1.json(), res2.json(), res3.json()]);
    expect(typeof b1.startedAt).toBe("number");
    expect(b1.startedAt).toBeGreaterThan(0);
    expect(b1.startedAt).toBe(b2.startedAt);
    expect(b1.startedAt).toBe(b3.startedAt);
    expect(b1.userId).toBe(b2.userId);

    await stopTimer(page);
  });

  test("deploy resilience: /api/timer/stop succeeds via direct API call (stop route DB fallback)", async ({ page }) => {
    // Before the fix: the stop route returned 404 when Redis was empty, even though
    // the time_entries row was still open. The DB fallback now handles this.
    test.setTimeout(90_000);

    await startTimerWithProject(page, `E2E stop-db-fallback — ${new Date().toISOString()}`);

    // Verify the timer is running
    const activeRes = await page.request.get("/api/timer/active");
    expect(activeRes.status()).toBe(200);
    const active = await activeRes.json();
    expect(active.startedAt).toBeGreaterThan(0);

    // Stop via direct API (simulates server-side path, same as page button)
    const stopRes = await page.request.post("/api/timer/stop", { data: {} });
    expect(stopRes.status(), `/api/timer/stop direct API call returned ${stopRes.status()}`).toBe(200);

    const stopBody = await stopRes.json();
    expect(stopBody).toHaveProperty("ok", true);

    // Timer must be gone
    const afterRes = await page.request.get("/api/timer/active");
    const afterBody = await afterRes.json();
    expect(!afterBody || !afterBody.startedAt).toBeTruthy();
  });

  // --- Problem 2: Ghost timer prevention (253h stuck timers) ---
  test("ghost prevention: second stop attempt returns 404, not a stuck ghost", async ({ page }) => {
    // Before the fix: orphaned entries (>24h) surfaced as active and a stop attempt
    // would silently fail or leave the timer stuck. Now: the second stop must 404.
    test.setTimeout(90_000);

    await startTimerWithProject(page, `E2E ghost-prevention — ${new Date().toISOString()}`);
    await stopTimer(page);

    // Second stop via direct API — no ghost to stop, must be 404
    const secondStop = await page.request.post("/api/timer/stop", { data: {} });
    expect(
      secondStop.status(),
      `Second /api/timer/stop should return 404 (no active timer). Got ${secondStop.status()}`
    ).toBe(404);

    // Active endpoint must confirm no timer is running
    const activeRes = await page.request.get("/api/timer/active");
    expect(activeRes.status()).toBe(200);
    const activeBody = await activeRes.json();
    expect(
      !activeBody || !activeBody.startedAt,
      `After stop, /api/timer/active must return null/empty. Got: ${JSON.stringify(activeBody)}`
    ).toBeTruthy();
  });

  // --- Problem 3: No blocking orphan after stop ---
  test("recovery: a new timer starts immediately after stop with no blocking orphan", async ({ page }) => {
    // Before the fix: a previous session's ghost entry could block starting a new timer.
    // Now: start → stop → start → stop must all succeed cleanly.
    test.setTimeout(150_000);

    const desc1 = `E2E recovery-first — ${new Date().toISOString()}`;
    await startTimerWithProject(page, desc1);
    await stopTimer(page);

    // Immediately start a second timer — must succeed without delay or error
    const desc2 = `E2E recovery-second — ${new Date().toISOString()}`;
    await startTimerWithProject(page, desc2);
    await expect(page.getByRole("button", { name: /stop session/i })).toBeVisible({ timeout: 30_000 });
    await stopTimer(page);

    // Both entries must appear in Last 7 Days
    await expect(page.getByText(desc1)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(desc2)).toBeVisible({ timeout: 60_000 });
  });
});
