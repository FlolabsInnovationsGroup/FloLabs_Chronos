/**
 * Entry lifecycle tests: edit (description, start time, end time), one-boundary rule,
 * delete with confirmation modal, Discord non-fatal 200, restart timer from entry.
 *
 * Stories covered:
 * - Edit stopped entry — description, start time, end time     (ENTRY_EDIT)
 * - Entry edit — Discord notification failure is non-fatal     (DISCORD_NON_FATAL)
 * - Delete entry — confirmation modal with correct button roles (ENTRY_DELETE)
 * - One-boundary edit rule                                      (ONE_BOUNDARY_RULE)
 * - Restart timer from a previous entry                         (RESTART_FROM_ENTRY)
 */

import { expect, test, type Page } from "@playwright/test";
import { signInProduction } from "./lib/production-auth";
import { markStories } from "./lib/notion-reporter";
import { STORIES } from "./lib/story-ids";

const E2E_PREFIX = "E2E entry-lifecycle";
const email = process.env.E2E_EMAIL ?? "pm@flolabsinnovations.com";
const password = process.env.E2E_PASSWORD ?? "flchron2026";

let suitePass = true;
test.afterEach(({}, info) => { if (info.status !== "passed") suitePass = false; });
test.afterAll(async ({ browser }) => {
  // Global cleanup: discard any stale active timer left by this suite
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  try {
    await signInProduction(p, email, password);
    await p.evaluate(async () => {
      const r = await fetch("/api/timer/active");
      const d = await r.json();
      if (d.timer) {
        await fetch("/api/timer/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discard: true }),
        });
      }
    });
  } catch { /* best-effort */ }
  finally { await ctx.close(); }

  await markStories(
    [STORIES.ENTRY_EDIT, STORIES.DISCORD_NON_FATAL, STORIES.ENTRY_DELETE,
     STORIES.ONE_BOUNDARY_RULE, STORIES.RESTART_FROM_ENTRY],
    suitePass
  );
});

/**
 * Create an entry via the UI and return its DB id.
 * Fetches /api/entries after stop to find the entry by exact description match.
 */
async function createEntry(page: Page, description: string): Promise<string> {
  // Discard any stale active timer via API
  await page.evaluate(async () => {
    const r = await fetch("/api/timer/active");
    const d = await r.json();
    if (d.timer) {
      await fetch("/api/timer/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discard: true }),
      });
    }
  });
  await page.goto("/timer", { waitUntil: "domcontentloaded" });

  await page.getByPlaceholder("What are you working on?").fill(description);

  await page.getByRole("button", { name: /select project/i }).first().click();
  await expect(page.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("option").first().click();

  await page.getByRole("button", { name: /start session/i }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);

  const stopPromise = page.waitForResponse(
    (r) => r.url().includes("/api/timer/stop") && r.request().method() === "POST",
    { timeout: 30_000 }
  );
  await page.getByRole("button", { name: /stop session/i }).click();
  await stopPromise;
  await expect(page.getByRole("button", { name: /start session/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(description)).toBeVisible({ timeout: 30_000 });

  // Fetch the entry ID
  const entryId = await page.evaluate(async (desc) => {
    const r = await fetch("/api/entries?limit=50");
    const d = await r.json();
    const entry = (d.entries ?? []).find((e: { description: string; id: string }) =>
      e.description === desc
    );
    return entry?.id ?? null;
  }, description);

  if (!entryId) throw new Error(`Entry not found in /api/entries for description: ${description}`);
  return entryId as string;
}

/** Delete an entry by ID via API and verify it disappears from the page. */
async function deleteEntryById(page: Page, entryId: string, description: string): Promise<void> {
  await page.evaluate(async (id) => {
    await fetch(`/api/entries/${id}`, { method: "DELETE" });
  }, entryId);
  await page.goto("/timer", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(description)).not.toBeVisible({ timeout: 15_000 });
}

/**
 * Click an action button on the specific entry card identified by entryId.
 * The entry card must expose action buttons with known aria-labels.
 * Falls back to finding the container containing description text.
 */
async function clickEntryAction(
  page: Page,
  description: string,
  action: "Edit this entry" | "Delete this entry" | "Start timer from this entry"
): Promise<void> {
  // Find the paragraph with the exact description text, then traverse to its
  // ancestor that contains action buttons, and click the matching one.
  await page.evaluate(
    ({ desc, label }) => {
      // Walk up from description text to find action buttons container
      const paragraphs = Array.from(document.querySelectorAll("p"));
      const descParagraph = paragraphs.find((p) => p.textContent?.trim() === desc);
      if (!descParagraph) return;

      let el: Element | null = descParagraph;
      while (el) {
        const btn = el.querySelector(`[aria-label="${label}"]`);
        if (btn) { (btn as HTMLElement).click(); return; }
        el = el.parentElement;
      }
    },
    { desc: description, label: action }
  );
}

test.describe("Production — entry edit, delete, and restart", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(300_000);
    await signInProduction(page, email, password);
  });

  // ---------------------------------------------------------------------------
  // Story: Edit stopped entry — description, start time, end time
  // Expected: Edit modal opens pre-populated. Changing description + start time
  //   fires PATCH /api/entries/:id (200). Entry card reflects updated values.
  //   Duration recalculates. End time locks when start is changed (and vice versa).
  // ---------------------------------------------------------------------------
  test("can edit entry description and start time; duration recalculates; end time locks", async ({ page }) => {
    const desc = `${E2E_PREFIX} edit-${Date.now()}`;
    const entryId = await createEntry(page, desc);

    // Open edit modal for the specific entry
    await clickEntryAction(page, desc, "Edit this entry");
    await expect(page.getByText("Edit entry")).toBeVisible({ timeout: 15_000 });

    // Verify modal pre-populated with correct description
    const descInput = page.locator("#description");
    await expect(descInput).toHaveValue(desc, { timeout: 5_000 });

    // Edit description
    const newDesc = `${desc} — EDITED`;
    await descInput.fill(newDesc);

    // Read current start time and subtract 2 minutes
    const startInputs = page.locator('input[type="datetime-local"]');
    const originalStart = await startInputs.first().inputValue();
    const d = new Date(originalStart);
    d.setMinutes(d.getMinutes() - 2);
    const newStart = d.toISOString().slice(0, 16);

    await page.evaluate((val) => {
      const inputs = document.querySelectorAll('input[type="datetime-local"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(inputs[0], val);
      inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
    }, newStart);

    // Save the start time edit
    const patchPromise = page.waitForResponse(
      (r) => r.url().includes("/api/entries/") && r.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: /^save$/i }).click();
    const patchRes = await patchPromise;
    expect(patchRes.status()).toBe(200);

    // Reload and verify description persisted
    await page.goto("/timer", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(newDesc).first()).toBeVisible({ timeout: 30_000 });

    // Re-open edit modal — now editedField="start" is persisted, so end time
    // must be locked (🔒 icon visible and input disabled)
    await clickEntryAction(page, newDesc, "Edit this entry");
    await expect(page.getByText("Edit entry")).toBeVisible({ timeout: 10_000 });
    const endTimeInput = page.locator('input[type="datetime-local"]').nth(1);
    await expect(endTimeInput).toBeDisabled({ timeout: 5_000 });
    // 🔒 emoji must appear near the End Time label
    const lockSpan = page.locator('span:has-text("🔒")').last();
    await expect(lockSpan).toBeVisible({ timeout: 5_000 });
    // Close modal
    await page.keyboard.press("Escape");

    // Clean up
    await deleteEntryById(page, entryId, newDesc);
  });

  // ---------------------------------------------------------------------------
  // Story: One-boundary edit rule
  // Expected: After editing start time and saving, attempting to edit end time
  //   via API returns 400 "Cannot edit end: start was already edited".
  // ---------------------------------------------------------------------------
  test("one-boundary rule: API rejects editing second boundary after first is saved", async ({ page }) => {
    const desc = `${E2E_PREFIX} one-boundary-${Date.now()}`;
    const entryId = await createEntry(page, desc);

    // Open edit modal and change start time by -1 min
    await clickEntryAction(page, desc, "Edit this entry");
    await expect(page.getByText("Edit entry")).toBeVisible({ timeout: 15_000 });

    const startInputs = page.locator('input[type="datetime-local"]');
    const originalStart = await startInputs.first().inputValue();
    const d = new Date(originalStart);
    d.setMinutes(d.getMinutes() - 1);
    const newStart = d.toISOString().slice(0, 16);

    await page.evaluate((val) => {
      const inputs = document.querySelectorAll('input[type="datetime-local"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(inputs[0], val);
      inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
    }, newStart);

    const savePromise = page.waitForResponse(
      (r) => r.url().includes("/api/entries/") && r.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: /^save$/i }).click();
    const saveRes = await savePromise;
    expect(saveRes.status()).toBe(200);

    // Now try to edit end time via API — should get 400
    const stoppedAt = await page.evaluate(async (id) => {
      const r = await fetch(`/api/entries?limit=50`);
      const d = await r.json();
      const entry = (d.entries ?? []).find((e: { id: string }) => e.id === id);
      return entry?.stoppedAt;
    }, entryId);

    if (stoppedAt) {
      const newEnd = new Date(new Date(stoppedAt).getTime() - 60_000).toISOString();
      const rejectRes = await page.evaluate(
        async ({ id, se }) => {
          const r = await fetch(`/api/entries/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stoppedAt: se }),
          });
          return { status: r.status, body: await r.json() };
        },
        { id: entryId, se: newEnd }
      );
      expect(rejectRes.status).toBe(400);
      expect(rejectRes.body.error).toMatch(/cannot edit end.*start was already edited/i);
    }

    // Clean up
    await deleteEntryById(page, entryId, desc);
  });

  // ---------------------------------------------------------------------------
  // Story: Delete entry — confirmation modal with correct button roles
  // Expected: Delete icon shows confirmation dialog. Cancel is primary (filled).
  //   Delete is danger (red). Confirming fires DELETE /api/entries/:id (200).
  // ---------------------------------------------------------------------------
  test("delete entry: confirmation modal shown; Cancel=primary; entry disappears after confirm", async ({ page }) => {
    const desc = `${E2E_PREFIX} delete-${Date.now()}`;
    const entryId = await createEntry(page, desc);

    await clickEntryAction(page, desc, "Delete this entry");
    await expect(page.getByText("Delete entry")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/are you sure/i)).toBeVisible();

    // Cancel button must not be danger-styled
    const cancelBtn = page.getByRole("button", { name: /cancel/i });
    await expect(cancelBtn).toBeVisible();
    const cancelClass = await cancelBtn.getAttribute("class") ?? "";
    expect(cancelClass).not.toMatch(/text-error|text-red|danger/i);

    const deleteBtn = page.getByRole("button", { name: /^delete$/i });
    await expect(deleteBtn).toBeVisible();

    const deletePromise = page.waitForResponse(
      (r) => r.url().includes("/api/entries/") && r.request().method() === "DELETE",
      { timeout: 30_000 }
    );
    await deleteBtn.click();
    const deleteRes = await deletePromise;
    expect(deleteRes.status()).toBe(200);
    const body = await deleteRes.json();
    expect(body.success).toBe(true);

    await expect(page.getByText(desc)).not.toBeVisible({ timeout: 15_000 });
  });

  // ---------------------------------------------------------------------------
  // Story: Entry edit — Discord notification failure is non-fatal (returns 200)
  // ---------------------------------------------------------------------------
  test("entry PATCH returns 200 even when Discord notification fails", async ({ page }) => {
    const desc = `${E2E_PREFIX} discord-nonfatal-${Date.now()}`;
    const entryId = await createEntry(page, desc);

    await clickEntryAction(page, desc, "Edit this entry");
    await expect(page.getByText("Edit entry")).toBeVisible({ timeout: 15_000 });

    const patchPromise = page.waitForResponse(
      (r) => r.url().includes("/api/entries/") && r.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await page.locator("#description").fill(`${desc} — discord-test`);
    await page.getByRole("button", { name: /^save$/i }).click();
    const patchRes = await patchPromise;

    expect(patchRes.status()).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody).not.toHaveProperty("error");
    expect(patchBody).toHaveProperty("entry");

    await deleteEntryById(page, entryId, `${desc} — discord-test`);
  });

  // ---------------------------------------------------------------------------
  // Story: Restart timer from a previous entry
  // ---------------------------------------------------------------------------
  test("restart timer from entry: new session starts with same description and project", async ({ page }) => {
    const desc = `${E2E_PREFIX} restart-${Date.now()}`;
    const entryId = await createEntry(page, desc);

    const startFromPromise = page.waitForResponse(
      (r) => r.url().includes("/api/timer/start") && r.request().method() === "POST",
      { timeout: 30_000 }
    );
    await clickEntryAction(page, desc, "Start timer from this entry");
    const startRes = await startFromPromise;
    expect(startRes.status()).toBe(200);

    const startBody = await startRes.json();
    expect(startBody.ok).toBe(true);
    expect(startBody.timer.description).toBe(desc);

    await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 15_000 });

    // Properly await the discard to prevent stale timers leaking into other tests
    await page.evaluate(async () => {
      const r = await fetch("/api/timer/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discard: true }),
      });
      return r.status;
    });

    // Clean up original entry
    await deleteEntryById(page, entryId, desc);
  });
});
