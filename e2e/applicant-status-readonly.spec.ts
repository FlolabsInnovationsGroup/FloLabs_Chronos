import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("Production Chronos — applicant status read-only on Users edit", () => {
  test("Users edit modal shows read-only applicant status from flolabs_users", async ({ page }) => {
    test.skip(
      !email || !password,
      "Set E2E_EMAIL and E2E_PASSWORD (admin or HR) for production Chronos.",
    );

    test.setTimeout(120_000);

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill(email!);
    await page.locator("#password").fill(password!);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(/\/timer/, { timeout: 60_000 });

    await page.goto("/team");
    await page.getByRole("button", { name: "Users" }).click();

    const editButton = page.getByRole("button", { name: /Edit/i }).first();
    await expect(editButton).toBeVisible({ timeout: 30_000 });
    await editButton.click();

    await expect(page.getByText("Applicant status")).toBeVisible();
    await expect(page.getByText(/Read-only mirror of/i)).toBeVisible();
    await expect(page.getByText(/Hephaestus International HR/i)).toBeVisible();
    await expect(page.locator('select').filter({ has: page.getByText("Applicant status") })).toHaveCount(0);
  });
});
