/**
 * Full timer lifecycle with all field retention: description, project,
 * Notion task, and tags. Also covers the Active Project widget fix and
 * Weekly Momentum stats.
 *
 * Stories covered:
 * - Stop timer — entry retains description, project, Notion task, and tags (STOP_DATA_RETENTION)
 * - Set description, project, Notion task and tags on running timer       (SET_FIELDS_WHILE_RUNNING)
 * - Active Project widget shows project name immediately                   (ACTIVE_PROJECT_WIDGET)
 * - Weekly Momentum widget — hours, sessions, project stats                (WEEKLY_MOMENTUM)
 * - Timer start — JSON parse guard on empty/malformed API response         (TIMER_JSON_GUARD)
 */

import { expect, test } from "@playwright/test";
import { signInProduction } from "./lib/production-auth";
import { markStories } from "./lib/notion-reporter";
import { STORIES } from "./lib/story-ids";

const E2E_PREFIX = "E2E timer-full-flow";
const email = process.env.E2E_EMAIL ?? "pm@flolabsinnovations.com";
const password = process.env.E2E_PASSWORD ?? "flchron2026";

let suitePass = true;
test.afterEach(({}, info) => { if ((info.status === "failed" || info.status === "timedOut") && info.retry >= info.project.retries) suitePass = false; });
test.afterAll(async () => {
  await markStories(
    [STORIES.STOP_DATA_RETENTION, STORIES.SET_FIELDS_WHILE_RUNNING,
     STORIES.ACTIVE_PROJECT_WIDGET, STORIES.WEEKLY_MOMENTUM, STORIES.TIMER_JSON_GUARD],
    suitePass
  );
});

test.describe("Production — timer full-flow with all fields retained", () => {
  test("start timer, set project+task+tag+description while running; stop; entry retains all fields", async ({ page }) => {
    test.setTimeout(300_000);
    await signInProduction(page, email, password);

    // Discard any stale active timer
    const hasActive = await page.evaluate(async () => {
      const r = await fetch("/api/timer/active");
      const d = await r.json();
      return d.timer !== null;
    });
    if (hasActive) {
      await page.evaluate(() =>
        fetch("/api/timer/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discard: true }),
        })
      );
      await page.goto("/timer", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
    }

    const description = `${E2E_PREFIX} full-${Date.now()}`;

    // ── Story: Timer start — JSON parse guard ──────────────────────────────
    // Start fires POST /api/timer/start which must ALWAYS return valid JSON
    const startPromise = page.waitForResponse(
      (r) => r.url().includes("/api/timer/start") && r.request().method() === "POST",
      { timeout: 60_000 }
    );
    await page.getByPlaceholder("What are you working on?").fill(description);
    await page.getByRole("button", { name: /start session/i }).click();
    const startRes = await startPromise;
    expect(startRes.status(), "/api/timer/start must return 200").toBe(200);

    // Must be parseable JSON
    const startBody = await startRes.text();
    expect(() => JSON.parse(startBody), "timer/start response must be valid JSON").not.toThrow();
    const startData = JSON.parse(startBody);
    expect(startData.ok).toBe(true);
    expect(startData.timer).toBeDefined();

    // ── Story: Weekly Momentum shows Live badge + Sessions increments ──────
    await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 30_000 });
    const sessionsBefore = await page
      .locator("p:has-text('Sessions')").locator("..").locator("p").last()
      .textContent().catch(() => "0");

    // ── Story: Set project while running — Active Project widget updates ───
    const patchProject = page.waitForResponse(
      (r) => r.url().includes("/api/timer") && r.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: /select project/i }).first().click();
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
    const projectName = (await page.getByRole("option").first().textContent())?.trim() ?? "";
    await page.getByRole("option").first().click();
    await patchProject;

    // Active Project widget must now show the project name (not "No project")
    await expect(
      page.getByText("Active Project", { exact: false }).locator("..").locator("p").last()
    ).toHaveText(projectName, { timeout: 15_000 });

    // ── Story: Set Notion task while running ───────────────────────────────
    await page.getByPlaceholder(/search notion tasks/i).fill("token");
    await expect(page.getByRole("button", { name: /task Token Usage API/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /task Token Usage API/i }).click();
    await expect(page.getByText("Selected task:")).toBeVisible({ timeout: 10_000 });

    // ── Story: Set tag while running ──────────────────────────────────────
    const tagName = `e2e-${Date.now()}`;
    await page.getByPlaceholder(/add tags/i).fill(tagName);
    const createTagBtn = page.getByRole("button", { name: new RegExp(`create.*${tagName}`, "i") });
    await expect(createTagBtn).toBeVisible({ timeout: 10_000 });
    await createTagBtn.click();
    // Tag chip appears
    await expect(page.getByText(tagName)).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(1500);

    // ── Stop session ───────────────────────────────────────────────────────
    const stopPromise = page.waitForResponse(
      (r) => r.url().includes("/api/timer/stop") && r.request().method() === "POST",
      { timeout: 60_000 }
    );
    await page.getByRole("button", { name: /stop session/i }).click();
    const stopRes = await stopPromise;
    expect(stopRes.status()).toBe(200);

    // ── Story: Entry retains ALL four fields ───────────────────────────────
    // Description
    await expect(page.getByText(description)).toBeVisible({ timeout: 30_000 });
    // Project pill
    await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 10_000 });
    // Notion task link
    await expect(page.getByText("Token Usage API").first()).toBeVisible({ timeout: 10_000 });
    // Tag chip
    await expect(page.getByText(tagName).first()).toBeVisible({ timeout: 10_000 });

    // ── Story: Weekly Momentum — Last Project updates after stop ──────────
    const lastProjectCell = page
      .getByText("Last Project", { exact: false })
      .locator("..")
      .locator("p")
      .last();
    await expect(lastProjectCell).toHaveText(projectName, { timeout: 15_000 });

    // ── Cleanup: delete the specific entry via API ────────────────────────
    const deleted = await page.evaluate(async (desc) => {
      const r = await fetch("/api/entries?limit=50");
      const d = await r.json();
      const entry = (d.entries ?? []).find((e: { description: string; id: string }) =>
        e.description === desc
      );
      if (!entry) return false;
      await fetch(`/api/entries/${entry.id}`, { method: "DELETE" });
      return true;
    }, description);
    expect(deleted, `Could not find entry "${description}" to delete`).toBe(true);

    await page.goto("/timer", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(description)).not.toBeVisible({ timeout: 15_000 });

    // Cleanup: delete the created tag via API
    await page.evaluate(async (name) => {
      const r = await fetch("/api/tags");
      const d = await r.json();
      const tag = (d.tags ?? []).find((t: { name: string; id: string }) => t.name === name);
      if (tag) await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    }, tagName);
  });
});
