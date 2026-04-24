import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "pm@flolabsinnovations.com";
const password = process.env.E2E_PASSWORD ?? "flchron2026";

test.describe("Control (production)", () => {
  test("admin can open Control and load settings without error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(/\/timer/, { timeout: 30_000 });

    await page.goto("/control");
    await expect(page.getByRole("heading", { name: "Control" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Failed to load control settings.")).toBeHidden();

    const timeEntriesInput = page.getByLabel("Time Entries Database ID");
    await expect(timeEntriesInput).toBeVisible({ timeout: 15_000 });

    const controlRes = await page.request.get("/api/control");
    if (controlRes.ok()) {
      const body = (await controlRes.json()) as { config?: { notionDatabaseId?: string } };
      const fromApi = String(body.config?.notionDatabaseId ?? "");
      await expect(timeEntriesInput).toHaveValue(fromApi);
    }
  });
});
