import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("Production Chronos — Users page", () => {
  test("/api/users returns 200 after sign-in (no readJson failure path)", async ({ page }) => {
    test.skip(
      !email || !password,
      "Set E2E_EMAIL and E2E_PASSWORD to a real production Chronos account, then run: pnpm run test:e2e:production"
    );

    test.setTimeout(120_000);

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#email")).toBeVisible({ timeout: 60_000 });
    await page.locator("#email").fill(email!);
    await page.locator("#password").fill(password!);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(/\/timer/, { timeout: 60_000 });

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

    await page.goto("/team");
    const res = await usersResponse;
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { users?: unknown[]; warning?: string };
    expect(Array.isArray(body.users)).toBeTruthy();
  });
});
