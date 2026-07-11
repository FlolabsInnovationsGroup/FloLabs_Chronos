import { expect, test } from "@playwright/test";
import { extractEmails, loadTestUsers, signInProduction } from "./lib/production-auth";
import { markStory } from "./lib/notion-reporter";
import { STORIES } from "./lib/story-ids";

const users = loadTestUsers();
const adminUser = users.find((u) => u.role.toLowerCase() === "admin");

let suitePass = true;
test.afterEach(({}, info) => {
  if ((info.status === "failed" || info.status === "timedOut") && info.retry >= info.project.retries) {
    suitePass = false;
  }
});
test.afterAll(async () => {
  await markStory(STORIES.USERS_PAGE, suitePass);
});

test.describe("Production Chronos — Invitations", () => {
  test.skip(!adminUser, "No admin account in test_assets/test_users.json");

  test("admin Users page loads invitations API and invite UI", async ({ page }) => {
    test.setTimeout(120_000);

    const [email] = extractEmails(adminUser!);
    test.skip(!email, "Admin test user has no email");

    await signInProduction(page, email!, adminUser!.password);

    const apiRes = await page.request.get("/api/invitations");
    expect(apiRes.status()).toBe(200);
    const apiBody = (await apiRes.json()) as { invitations?: unknown[] };
    expect(Array.isArray(apiBody.invitations)).toBeTruthy();

    await page.goto("/team");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Pending invitations" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite Member" })).toBeVisible();
  });

  test("invalid invite token returns error on register page", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/register?invite=invalid-token-not-real");
    await expect(page.getByText(/invitation|not valid|invalid/i)).toBeVisible({ timeout: 30_000 });
  });

  test("GET /api/auth/invitation rejects missing token", async ({ request }) => {
    const base =
      process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ?? "https://athensgreecemarathon.com";
    const res = await request.get(`${base}/api/auth/invitation`);
    expect([400, 410]).toContain(res.status());
  });
});
