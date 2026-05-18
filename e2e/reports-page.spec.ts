import { expect, test } from "@playwright/test";
import { extractEmails, loadTestUsers, signInProduction } from "./lib/production-auth";

const users = loadTestUsers();

// Prefer admin or HR to guarantee entries exist; fall back to first available user
const primaryUser =
  users.find((u) => u.role.toLowerCase() === "admin") ??
  users.find((u) => u.role.toLowerCase().includes("human")) ??
  users[0];

test.describe("Production — Reports page", () => {
  test.skip(!primaryUser, "No test accounts found in test_assets/test_users.json");

  test("reports page loads without 500 and shows entries or empty-state; date-range filter re-renders cleanly", async ({ page }) => {
    test.setTimeout(120_000);

    const [email] = extractEmails(primaryUser!);
    test.skip(!email, "Test user has no email configured");

    await signInProduction(page, email!, primaryUser!.password);

    // Navigate to /reports
    const reportsResponsePromise = page.waitForResponse(
      (r) => {
        try {
          const u = new URL(r.url());
          return u.pathname.startsWith("/api/reports") && r.request().method() === "GET";
        } catch {
          return false;
        }
      },
      { timeout: 60_000 }
    );
    await page.goto("/reports", { waitUntil: "domcontentloaded" });

    // Page heading must be visible — confirms no hard 500
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 60_000 });

    // No error page text
    await expect(page.getByText("Something went wrong")).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(/internal server error/i)).toBeHidden();

    // Wait for the reports API response and assert it returns 200
    const reportsRes = await reportsResponsePromise;
    expect(
      reportsRes.status(),
      `/api/reports returned ${reportsRes.status()}: ${await reportsRes.text().catch(() => "")}`
    ).toBe(200);

    // At least one entry row OR an explicit empty/no-entries message must be present
    const hasEntries = await page.locator("table tbody tr").first().isVisible({ timeout: 20_000 }).catch(() => false);
    const hasEmptyMsg = await page
      .getByText(/no entries|no time entries|nothing here/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    expect(
      hasEntries || hasEmptyMsg,
      "Expected either table rows or a no-entries message on the Reports page"
    ).toBeTruthy();

    // Test the date range filter: look for a filter control and change range
    // The filter may be a button, select, or dropdown — try common labels
    const rangeButton = page
      .getByRole("button", { name: /last 7 days|date range|this week/i })
      .first();
    const rangeVisible = await rangeButton.isVisible({ timeout: 10_000 }).catch(() => false);

    if (rangeVisible) {
      await rangeButton.click();

      // Pick "Last 30 days" option if available
      const thirtyDaysOption = page.getByRole("option", { name: /last 30 days/i }).first();
      const thirtyVisible = await thirtyDaysOption.isVisible({ timeout: 10_000 }).catch(() => false);
      if (thirtyVisible) {
        await thirtyDaysOption.click();
      } else {
        // Try a generic "30 days" label in any menu item
        const fallback = page.getByText(/30 days/i).first();
        if (await fallback.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await fallback.click();
        }
      }

      // After the filter change the page should NOT show an error
      await expect(page.getByText("Something went wrong")).toBeHidden({ timeout: 20_000 });
      await expect(page.getByText(/internal server error/i)).toBeHidden();
      // Heading still present
      await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 30_000 });
    }
  });
});
