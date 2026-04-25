import { expect, test } from "@playwright/test";
import { extractEmails, loadTestUsers, signInProduction } from "./lib/production-auth";

function roleKey(role: string): string {
  return role.trim().toLowerCase();
}

test.describe("Production — all test_users.json accounts (browser)", () => {
  const users = loadTestUsers();
  test.skip(users.length === 0, "Add accounts to test_assets/test_users.json");

  for (const user of users) {
    const emails = extractEmails(user);
    const primary = emails[0];
    if (!primary) continue;

    const rk = roleKey(user.role);

    test(`${user.role} (${primary}): timer, task search API, role routes`, async ({ page }) => {
      test.setTimeout(240_000);

      await signInProduction(page, primary, user.password);
      await expect(page.getByPlaceholder("Search Notion tasks…")).toBeVisible({ timeout: 90_000 });

      const tasksRes = await page.request.get("/api/tasks?q=a");
      if (!tasksRes.ok()) {
        throw new Error(`/api/tasks failed: ${tasksRes.status()} ${await tasksRes.text().catch(() => "")}`);
      }
      const tasksBody = (await tasksRes.json()) as {
        tasks?: unknown[];
        meta?: { taskSearchConfigured?: boolean; hint?: string };
        error?: string;
      };
      expect(Array.isArray(tasksBody.tasks)).toBeTruthy();
      expect(tasksBody.meta).toBeDefined();

      if (tasksBody.meta?.taskSearchConfigured === false) {
        const hint = String(tasksBody.meta.hint ?? "");
        expect(hint.length).toBeGreaterThan(0);
      } else if (tasksBody.error) {
        expect(tasksBody.error.length).toBeGreaterThan(0);
      }

      if (rk === "admin") {
        await page.goto("/control", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Control" })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Failed to load control settings.")).toBeHidden();
        await expect(page.getByLabel("Time Entries Database ID")).toBeVisible({ timeout: 20_000 });
        const controlRes = await page.request.get("/api/control");
        expect(controlRes.status()).toBe(200);
        const controlJson = (await controlRes.json()) as { config?: { notionDatabaseId?: string } };
        const fromApi = String(controlJson.config?.notionDatabaseId ?? "");
        await expect(page.getByLabel("Time Entries Database ID")).toHaveValue(fromApi);
      }

      if (rk.includes("human") || rk === "hr") {
        const usersResponse = page.waitForResponse(
          (r) => {
            try {
              const u = new URL(r.url());
              return u.pathname.endsWith("/api/users") && r.request().method() === "GET";
            } catch {
              return false;
            }
          },
          { timeout: 60_000 }
        );
        await page.goto("/team", { waitUntil: "domcontentloaded" });
        const res = await usersResponse;
        expect(res.status()).toBe(200);
        const body = (await res.json()) as { users?: unknown[] };
        expect(Array.isArray(body.users)).toBeTruthy();
        await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Users service unavailable")).toHaveCount(0);
        await expect(page.getByPlaceholder("Search members…")).toBeVisible({ timeout: 45_000 });
      }

      if (rk === "member") {
        await page.goto("/reports", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText(/\d+ entries/)).toBeVisible();
        await page.goto("/team", { waitUntil: "domcontentloaded" });
        await page.waitForURL(/\/timer/, { timeout: 30_000 });
      }
    });
  }

  test("every linked email in test_users can sign in", async ({ page }) => {
    test.setTimeout(360_000);
    for (const user of users) {
      for (const email of extractEmails(user)) {
        await signInProduction(page, email, user.password);
        await expect(page.getByPlaceholder("Search Notion tasks…")).toBeVisible({ timeout: 90_000 });
        await page.context().clearCookies();
        await page.goto("/login", { waitUntil: "domcontentloaded" });
      }
    }
  });
});
