import { expect, test } from "@playwright/test";
import { extractEmails, loadTestUsers, signInProduction } from "./lib/production-auth";
import { markStory } from "./lib/notion-reporter";
import { STORIES } from "./lib/story-ids";

const users = loadTestUsers();
const primaryUser =
  users.find((u) => u.role.toLowerCase() === "admin") ??
  users.find((u) => /human resources|^hr$/i.test(u.role.trim())) ??
  users[0];

let suitePass = true;
test.afterEach(({}, info) => { if ((info.status === "failed" || info.status === "timedOut") && info.retry >= info.project.retries) suitePass = false; });
test.afterAll(async () => { await markStory(STORIES.USERS_PAGE, suitePass); });

test.describe("Production Chronos — Users page", () => {
  test.skip(!primaryUser, "No admin/HR account found in test_assets/test_users.json");

  test("/api/users returns 200 after sign-in (no readJson failure path)", async ({ page }) => {
    test.setTimeout(120_000);

    const [email] = extractEmails(primaryUser!);
    test.skip(!email, "Test user has no email configured");

    await signInProduction(page, email!, primaryUser!.password);

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

    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Users service unavailable")).toHaveCount(0);
  });
});
