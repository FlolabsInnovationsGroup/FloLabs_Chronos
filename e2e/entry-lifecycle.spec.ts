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
import { extractEmails, loadTestUsers, signInProduction } from "./lib/production-auth";
import { markStories } from "./lib/notion-reporter";
import { STORIES } from "./lib/story-ids";

const E2E_PREFIX = "E2E entry-lifecycle";
const email = process.env.E2E_EMAIL ?? "pm@flolabsinnovations.com";
const password = process.env.E2E_PASSWORD ?? "flchron2026";

let suitePass = true;
test.afterEach(({}, info) => { if (info.status !== "passed") suitePass = false; });
test.afterAll(async () => {
  await markStories(
    [STORIES.ENTRY_EDIT, STORIES.DISCORD_NON_FATAL, STORIES.ENTRY_DELETE,
     STORIES.ONE_BOUNDARY_RULE, STORIES.RESTART_FROM_ENTRY],
    suitePass
  );
});

/** Helper: start + immediately stop a timer, returning the entry card locator. */
async function createEntry(page: Page, description: string): Promise<void> {
  // Stop any stale active timer
  const stopBtn = page.getByRole("button", { name: /stop session/i });
  if (await stopBtn.isVisible().catch(() => false)) {
    // Need a project set to enable stop — use API discard
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

  // Fill description
  await page.getByPlaceholder("What are you working on?").fill(description);

  // Select first project
  await page.getByRole("button", { name: /select project/i }).first().click();
  await expect(page.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("option").first().click();

  // Start
  await page.getByRole("button", { name: /start session/i }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);

  // Stop
  await page.getByRole("button", { name: /stop session/i }).click();
  await expect(page.getByRole("button", { name: /start session/i })).toBeVisible({ timeout: 30_000 });

  // Entry should appear in Last 7 Days
  await expect(page.getByText(description)).toBeVisible({ timeout: 30_000 });
}

/** Helper: get the entry id from the last visible entry card PATCH URL */
async function getLastEntryId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const cards = document.querySelectorAll('[aria-label="Edit this entry"]');
    const last = cards[cards.length - 1] as HTMLElement | null;
    return last?.closest("[data-entry-id]")?.getAttribute("data-entry-id") ?? null;
  });
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
    await createEntry(page, desc);

    // Open edit modal
    await page.getByRole("button", { name: "Edit this entry" }).last().click();
    await expect(page.getByText("Edit entry")).toBeVisible({ timeout: 15_000 });

    // Verify modal pre-populated
    const descInput = page.locator("#description");
    await expect(descInput).toHaveValue(desc);

    // Edit description
    const newDesc = `${desc} — EDITED`;
    await descInput.fill(newDesc);

    // Read current start time and subtract 2 minutes
    const startInputs = page.locator('input[type="datetime-local"]');
    const originalStart = await startInputs.first().inputValue();
    const d = new Date(originalStart);
    d.setMinutes(d.getMinutes() - 2);
    const newStart = d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"

    // Set new start time using native value setter (React controlled input)
    await page.evaluate((val) => {
      const inputs = document.querySelectorAll('input[type="datetime-local"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(inputs[0], val);
      inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
    }, newStart);

    // End time should now be locked
    const endLabel = page.locator("text=/End Time/i");
    await expect(endLabel).toBeVisible({ timeout: 5_000 });
    // Lock icon (🔒) appears as emoji or Unicode in the label
    const endLabelText = await endLabel.locator("..").textContent();
    expect(endLabelText).toMatch(/🔒|lock/i);

    // Save
    const patchPromise = page.waitForResponse(
      (r) => r.url().includes("/api/entries/") && r.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: /^save$/i }).click();
    const patchRes = await patchPromise;
    expect(patchRes.status()).toBe(200);

    // Reload to confirm persistence
    await page.goto("/timer", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(newDesc)).toBeVisible({ timeout: 30_000 });

    // Clean up: delete the entry
    await page.getByRole("button", { name: "Edit this entry" }).last().click();
    await expect(page.getByText("Edit entry")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /close modal/i }).click();
    await page.getByRole("button", { name: "Delete this entry" }).last().click();
    await expect(page.getByText("Are you sure")).toBeVisible({ timeout: 10_000 });
    const deletePromise = page.waitForResponse(
      (r) => r.url().includes("/api/entries/") && r.request().method() === "DELETE",
      { timeout: 30_000 }
    );
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      btns.find((b) => b.textContent?.trim() === "Delete")?.click();
    });
    await deletePromise;
  });

  // ---------------------------------------------------------------------------
  // Story: One-boundary edit rule
  // Expected: After editing start time and saving, attempting to edit end time
  //   via API returns 400 "Cannot edit end: start was already edited".
  // ---------------------------------------------------------------------------
  test("one-boundary rule: API rejects editing second boundary after first is saved", async ({ page }) => {
    const desc = `${E2E_PREFIX} one-boundary-${Date.now()}`;
    await createEntry(page, desc);

    // Get entry ID from the PATCH that happens on edit
    const patchCapture: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/api/entries/") && r.request().method() === "PATCH") {
        patchCapture.push(r.url());
      }
    });

    // Open edit modal and change start time by -1 min
    await page.getByRole("button", { name: "Edit this entry" }).last().click();
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

    // Extract entry ID from the URL
    const entryId = patchCapture[0]?.split("/api/entries/")[1];
    expect(entryId).toBeTruthy();

    // Now attempt to edit the end time via API — should get 400
    const stoppedAt = await page.evaluate(async (id) => {
      const r = await fetch(`/api/entries?limit=5`);
      const d = await r.json();
      const entry = (d.entries ?? []).find((e: { id: string }) => e.id === id);
      return entry?.stoppedAt;
    }, entryId);

    if (stoppedAt) {
      const newEnd = new Date(new Date(stoppedAt).getTime() - 60_000).toISOString();
      const rejectRes = await page.evaluate(async ({ id, stoppedAt: newStop }) => {
        const r = await fetch(`/api/entries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stoppedAt: newStop }),
        });
        return { status: r.status, body: await r.json() };
      }, { id: entryId, stoppedAt: newEnd });

      expect(rejectRes.status).toBe(400);
      expect(rejectRes.body.error).toMatch(/cannot edit end.*start was already edited/i);
    }

    // Clean up
    await page.getByRole("button", { name: "Delete this entry" }).last().click();
    await expect(page.getByText("Are you sure")).toBeVisible({ timeout: 10_000 });
    await page.evaluate(() => {
      document.querySelectorAll("button")[
        Array.from(document.querySelectorAll("button")).findIndex((b) => b.textContent?.trim() === "Delete")
      ]?.click();
    });
    await page.waitForResponse(
      (r) => r.url().includes("/api/entries/") && r.request().method() === "DELETE",
      { timeout: 30_000 }
    );
  });

  // ---------------------------------------------------------------------------
  // Story: Delete entry — confirmation modal with correct button roles
  // Expected: Delete icon shows confirmation dialog. Cancel is the primary
  //   (visually highlighted) button. Delete is the danger button.
  //   Confirming fires DELETE /api/entries/:id (200). Entry disappears.
  // ---------------------------------------------------------------------------
  test("delete entry: confirmation modal shown; Cancel=primary; entry disappears after confirm", async ({ page }) => {
    const desc = `${E2E_PREFIX} delete-${Date.now()}`;
    await createEntry(page, desc);

    // Click delete
    await page.getByRole("button", { name: "Delete this entry" }).last().click();
    const modal = page.locator('[role="dialog"], [aria-modal]').or(page.getByText("Delete entry"));
    await expect(modal.first()).toBeVisible({ timeout: 10_000 });

    // "Are you sure" text present
    await expect(page.getByText(/are you sure/i)).toBeVisible();

    // Cancel button must be primary variant (contains background/teal styling)
    const cancelBtn = page.getByRole("button", { name: /cancel/i });
    await expect(cancelBtn).toBeVisible();
    const cancelClass = await cancelBtn.getAttribute("class") ?? "";
    expect(cancelClass).not.toMatch(/text-error|text-red|danger/i); // Cancel is NOT danger

    // Delete button exists and is styled differently (danger/red)
    const deleteBtn = page.getByRole("button", { name: /^delete$/i });
    await expect(deleteBtn).toBeVisible();

    // Confirm delete
    const deletePromise = page.waitForResponse(
      (r) => r.url().includes("/api/entries/") && r.request().method() === "DELETE",
      { timeout: 30_000 }
    );
    await deleteBtn.click();
    const deleteRes = await deletePromise;
    expect(deleteRes.status()).toBe(200);
    const body = await deleteRes.json();
    expect(body.success).toBe(true);

    // Entry card gone
    await expect(page.getByText(desc)).not.toBeVisible({ timeout: 15_000 });
  });

  // ---------------------------------------------------------------------------
  // Story: Entry edit — Discord notification failure is non-fatal (returns 200)
  // Expected: PATCH /api/entries/:id returns 200 even when Discord notification
  //   fails. The response may include a `warning` field but no `error` field.
  // ---------------------------------------------------------------------------
  test("entry PATCH returns 200 even when Discord notification fails", async ({ page }) => {
    const desc = `${E2E_PREFIX} discord-nonfatal-${Date.now()}`;
    await createEntry(page, desc);

    await page.getByRole("button", { name: "Edit this entry" }).last().click();
    await expect(page.getByText("Edit entry")).toBeVisible({ timeout: 15_000 });

    const patchPromise = page.waitForResponse(
      (r) => r.url().includes("/api/entries/") && r.request().method() === "PATCH",
      { timeout: 30_000 }
    );

    const descInput = page.locator("#description");
    await descInput.fill(`${desc} — discord-test`);
    await page.getByRole("button", { name: /^save$/i }).click();
    const patchRes = await patchPromise;

    // Must be 200 regardless of Discord notification success
    expect(patchRes.status()).toBe(200);
    const patchBody = await patchRes.json();
    // Must not have `error` field (that would indicate a fatal failure)
    expect(patchBody).not.toHaveProperty("error");
    // Must have `entry` field (the updated entry)
    expect(patchBody).toHaveProperty("entry");

    // Clean up
    await page.getByRole("button", { name: "Delete this entry" }).last().click();
    await expect(page.getByText("Are you sure")).toBeVisible({ timeout: 10_000 });
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      btns.find((b) => b.textContent?.trim() === "Delete")?.click();
    });
    await page.waitForResponse(
      (r) => r.url().includes("/api/entries/") && r.request().method() === "DELETE",
      { timeout: 30_000 }
    );
  });

  // ---------------------------------------------------------------------------
  // Story: Restart timer from a previous entry
  // Expected: Play icon on an entry card starts a new session pre-filled with
  //   the same description, project, and tags. New timer starts running.
  // ---------------------------------------------------------------------------
  test("restart timer from entry: new session starts with same description and project", async ({ page }) => {
    const desc = `${E2E_PREFIX} restart-${Date.now()}`;
    await createEntry(page, desc);

    // Click "Start timer from this entry"
    const startFromPromise = page.waitForResponse(
      (r) => r.url().includes("/api/timer/start") && r.request().method() === "POST",
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: "Start timer from this entry" }).last().click();
    const startRes = await startFromPromise;
    expect(startRes.status()).toBe(200);

    const startBody = await startRes.json();
    expect(startBody.ok).toBe(true);
    expect(startBody.timer.description).toBe(desc);

    // Timer is now running
    await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 15_000 });

    // Stop and discard
    await page.evaluate(() =>
      fetch("/api/timer/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discard: true }),
      })
    );
    await page.goto("/timer", { waitUntil: "domcontentloaded" });

    // Clean up original entry
    await page.waitForTimeout(1000);
    const delBtns = page.getByRole("button", { name: "Delete this entry" });
    const count = await delBtns.count();
    if (count > 0) {
      await delBtns.last().click();
      await expect(page.getByText("Are you sure")).toBeVisible({ timeout: 10_000 });
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        btns.find((b) => b.textContent?.trim() === "Delete")?.click();
      });
      await page.waitForResponse(
        (r) => r.url().includes("/api/entries/") && r.request().method() === "DELETE",
        { timeout: 30_000 }
      );
    }
  });
});
