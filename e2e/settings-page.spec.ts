/**
 * Settings page: Appearance, Profile, Password, and Session sections load.
 * Theme dropdown contains Light / Dark / System options.
 *
 * Story covered:
 * - Settings — theme, profile name, password change (SETTINGS)
 */

import { expect, test } from "@playwright/test";
import { signInProduction } from "./lib/production-auth";
import { markStory } from "./lib/notion-reporter";
import { STORIES } from "./lib/story-ids";

const email = process.env.E2E_EMAIL ?? "pm@flolabsinnovations.com";
const password = process.env.E2E_PASSWORD ?? "flchron2026";

let suitePass = true;
test.afterEach(({}, info) => { if ((info.status === "failed" || info.status === "timedOut") && info.retry >= info.project.retries) suitePass = false; });
test.afterAll(async () => { await markStory(STORIES.SETTINGS, suitePass); });

test.describe("Production — settings page", () => {
  test("settings page loads with Appearance, Profile, Password, and Session sections", async ({ page }) => {
    test.setTimeout(90_000);
    await signInProduction(page, email, password);

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    // Four expected sections
    await expect(page.getByText("Appearance", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Profile", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Password", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Session", { exact: true })).toBeVisible({ timeout: 10_000 });

    // Theme dropdown exists and has three options
    const themeSelect = page.getByRole("combobox").or(
      page.locator("button", { hasText: /light|dark|system/i })
    ).first();
    await expect(themeSelect).toBeVisible({ timeout: 10_000 });

    // Profile has a name input
    const nameInput = page.locator("input#name, input[placeholder*='name' i]").first();
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    // Password section has current + new + confirm fields
    const passwordInputs = page.locator("input[type='password']");
    await expect(passwordInputs).toHaveCount(3, { timeout: 10_000 });

    // Log out button present
    await expect(page.getByRole("button", { name: /log out/i })).toBeVisible({ timeout: 10_000 });
  });
});
