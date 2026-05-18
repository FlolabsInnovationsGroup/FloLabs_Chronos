import { expect, test } from "@playwright/test";
import { extractEmails, loadTestUsers, signInProduction } from "./lib/production-auth";

const users = loadTestUsers();
const admin = users.find((u) => u.role.toLowerCase() === "admin");

test.describe("Edit user modal — save spinner", () => {
  test.skip(!admin, "Requires an admin account in test_assets/test_users.json");

  test("spinner appears next to Save Changes text while PATCH is in-flight", async ({ page }) => {
    test.setTimeout(120_000);

    const [email] = extractEmails(admin!);
    test.skip(!email, "Admin account must have an email");

    await signInProduction(page, email!, admin!.password);

    // Navigate to /team and wait for the user list
    await page.goto("/team", { waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("Search members…")).toBeVisible({ timeout: 45_000 });

    // Intercept the PATCH before triggering the save so the spinner is visible long enough to assert
    let patchResolve!: () => void;
    const patchGate = new Promise<void>((res) => { patchResolve = res; });
    await page.route("**/api/users/**", async (route) => {
      if (route.request().method() === "PATCH") {
        await patchGate; // hold until we have asserted the spinner
      }
      await route.continue();
    });

    // Open the first edit modal
    const editButtons = page.locator("button").filter({ has: page.locator(".material-symbols-outlined", { hasText: "edit" }) });
    await editButtons.first().click();
    await expect(page.getByRole("heading", { name: "Edit Member" })).toBeVisible({ timeout: 10_000 });

    // Click Save Changes
    const saveBtn = page.getByRole("button", { name: /save changes/i });
    await saveBtn.click();

    // While PATCH is held, the button must be disabled and show the spinner
    await expect(saveBtn).toBeDisabled({ timeout: 5_000 });
    await expect(page.locator("button[disabled] svg.animate-spin")).toBeVisible({ timeout: 5_000 });

    // Release the PATCH — modal should close
    patchResolve();
    await expect(page.getByRole("heading", { name: "Edit Member" })).toBeHidden({ timeout: 15_000 });
  });
});
