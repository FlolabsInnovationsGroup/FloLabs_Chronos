import { expect, test } from "@playwright/test";
import { extractEmails, loadTestUsers, signInProduction } from "./lib/production-auth";

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  try {
    await signInProduction(page, email, password);
  } catch (e) {
    throw new Error(
      `${e instanceof Error ? e.message : String(e)} Update test_assets/test_users.json or set PLAYWRIGHT_BASE_URL to the deployment where these accounts exist.`
    );
  }
}

test.describe("Production — test_accounts (Users + Reports)", () => {
  test("HR-style account: Users page loads, /api/users 200, no service error banner", async ({ page }) => {
    const users = loadTestUsers();
    const hrLike = users.find(
      (u) =>
        /human resources|^hr$/i.test(u.role.trim()) ||
        u.role.toLowerCase().includes("human resources")
    );
    test.skip(!hrLike, "Add an HR / Human Resources account to test_assets/test_users.json");

    test.setTimeout(120_000);

    const [hrEmail] = extractEmails(hrLike!);
    test.skip(!hrEmail, "Human Resources account must include at least one email");
    await signIn(page, hrEmail!, hrLike!.password);

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
    const body = (await res.json()) as { users?: unknown[]; warning?: string };
    expect(Array.isArray(body.users)).toBeTruthy();

    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Users service unavailable")).toHaveCount(0);

    await expect(page.getByRole("button", { name: "Users" })).toBeVisible();
    // Non-member roles: search box appears after user list fetch; empty states use the same area
    await expect(page.getByPlaceholder("Search members…")).toBeVisible({ timeout: 45_000 });
  });

  test("Admin and Human Resources see the same Joined user directory (/api/users ids match)", async ({ page }) => {
    const users = loadTestUsers();
    const hrLike = users.find(
      (u) =>
        /human resources|^hr$/i.test(u.role.trim()) ||
        u.role.toLowerCase().includes("human resources")
    );
    const adminLike = users.find((u) => u.role.trim().toLowerCase() === "admin");
    test.skip(
      !hrLike || !adminLike,
      "Add Human Resources and admin accounts to test_assets/test_users.json"
    );

    test.setTimeout(180_000);

    async function sortedUserIdsFromTeamPage(which: "hr" | "admin") {
      const creds = which === "hr" ? hrLike! : adminLike!;
      const [primaryEmail] = extractEmails(creds);
      if (!primaryEmail) throw new Error(`No email configured for ${which} test account.`);
      await signIn(page, primaryEmail, creds.password);

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
      const body = (await res.json()) as { users?: { id: string }[] };
      expect(Array.isArray(body.users)).toBeTruthy();
      const ids = (body.users ?? []).map((u) => u.id).filter(Boolean);
      return [...ids].sort();
    }

    const hrIds = await sortedUserIdsFromTeamPage("hr");
    await page.context().clearCookies();
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const adminIds = await sortedUserIdsFromTeamPage("admin");
    expect(adminIds).toEqual(hrIds);
  });

  test("Member account: Reports page shows header and stats; /team redirects to timer", async ({ page }) => {
    const users = loadTestUsers();
    const member = users.find((u) => u.role.trim().toLowerCase() === "member");
    test.skip(!member, "Add a member account to test_assets/test_users.json");

    test.setTimeout(120_000);

    const [memberEmail] = extractEmails(member!);
    test.skip(!memberEmail, "Member account must include at least one email");
    await signIn(page, memberEmail!, member!.password);

    await page.goto("/reports", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/\d+ entries/).first()).toBeVisible();
    await expect(page.getByText("Total Hours")).toBeVisible();

    await page.goto("/team", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/timer/, { timeout: 30_000 });
  });

  test("Each linked email can sign in with same password", async ({ page }) => {
    const users = loadTestUsers();
    test.skip(users.length === 0, "Add test users to test_assets/test_users.json");
    test.setTimeout(300_000);

    for (const user of users) {
      const emails = extractEmails(user);
      for (const email of emails) {
        await signIn(page, email, user.password);
        await page.context().clearCookies();
      }
    }
  });
});
