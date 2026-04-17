import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

type TestUserEntry = { email?: string; emails?: string[]; password: string; role: string };

function extractEmails(user: TestUserEntry): string[] {
  const direct = typeof user.email === "string" ? [user.email] : [];
  const fromList = Array.isArray(user.emails) ? user.emails : [];
  const normalized = [...direct, ...fromList]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(normalized)];
}

function loadTestUsers(): TestUserEntry[] {
  const path = join(process.cwd(), "test_assets", "test_users.json");
  if (!existsSync(path)) {
    return [];
  }
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw) as { users?: TestUserEntry[] };
  return Array.isArray(data.users) ? data.users : [];
}

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  const outcome = await Promise.race([
    page.waitForURL(/\/timer/, { timeout: 90_000 }).then(() => "ok" as const),
    page
      .getByText("Invalid email or password.")
      .waitFor({ state: "visible", timeout: 90_000 })
      .then(() => "bad_creds" as const),
    page
      .getByText("Something went wrong. Please try again.")
      .waitFor({ state: "visible", timeout: 90_000 })
      .then(() => "error" as const),
  ]);

  if (outcome === "bad_creds") {
    throw new Error(
      `Sign-in failed (invalid credentials) for ${email}. Update passwords in test_assets/test_users.json to match production, or set PLAYWRIGHT_BASE_URL to the deployment where these accounts exist.`
    );
  }
  if (outcome === "error") {
    throw new Error(`Sign-in failed (server error) for ${email}.`);
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
    await expect(page.getByText(/\d+ entries/)).toBeVisible();
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
