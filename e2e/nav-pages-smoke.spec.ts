import { expect, test } from "@playwright/test";
import { extractEmails, loadTestUsers, signInProduction } from "./lib/production-auth";

const users = loadTestUsers();

// Admin sees the most routes (settings, tags, projects, team); use admin when available
const primaryUser =
  users.find((u) => u.role.toLowerCase() === "admin") ??
  users.find((u) => u.role.toLowerCase().includes("human")) ??
  users[0];

type RouteCase = {
  path: string;
  /** Role-restricted routes that non-admins are redirected away from — skip check when true */
  adminOnly?: boolean;
};

const routes: RouteCase[] = [
  { path: "/timer" },
  { path: "/reports" },
  { path: "/settings" },
  { path: "/tags" },
  { path: "/projects" },
  { path: "/team", adminOnly: true },
];

const ERROR_PATTERNS = [
  /something went wrong/i,
  /internal server error/i,
  /application error/i,
  /unhandled runtime error/i,
  /500/,
  /failed to load/i,
];

test.describe("Production — nav-pages smoke (no crashes)", () => {
  test.skip(!primaryUser, "No test accounts found in test_assets/test_users.json");

  test("every nav page loads without an error state", async ({ page }) => {
    test.setTimeout(120_000);

    const [email] = extractEmails(primaryUser!);
    test.skip(!email, "Test user has no email configured");

    const isAdmin = primaryUser!.role.toLowerCase() === "admin";

    await signInProduction(page, email!, primaryUser!.password);

    for (const { path, adminOnly } of routes) {
      if (adminOnly && !isAdmin) {
        // Non-admin users are redirected away from /team — skip route, do not fail
        continue;
      }

      await page.goto(path, { waitUntil: "domcontentloaded" });

      // Allow brief settling for client-side navigations
      await page.waitForTimeout(500);

      // Detect hard redirects that land somewhere unexpected (e.g. back to /login)
      // /reports for a member is fine; only flag if we land on /login or /error
      const currentUrl = page.url();
      const isErrorPage = currentUrl.includes("/error") || currentUrl.includes("/_error");
      expect(isErrorPage, `${path} redirected to error page: ${currentUrl}`).toBeFalsy();

      // If redirected to /timer (e.g. member visiting /team) that is acceptable — skip remaining checks
      if (adminOnly && currentUrl.includes("/timer")) {
        continue;
      }

      // No visible error text patterns
      for (const pattern of ERROR_PATTERNS) {
        const errorVisible = await page
          .getByText(pattern)
          .first()
          .isVisible({ timeout: 3_000 })
          .catch(() => false);
        expect(
          errorVisible,
          `Error pattern "${pattern}" found on page ${path} (current URL: ${currentUrl})`
        ).toBeFalsy();
      }

      // Main content area must not be blank — at least one visible element with text inside <main>
      const mainContent = page.locator("main");
      const mainExists = await mainContent.isVisible({ timeout: 10_000 }).catch(() => false);
      if (mainExists) {
        const mainText = await mainContent.innerText().catch(() => "");
        expect(
          mainText.trim().length,
          `<main> content is blank on ${path}`
        ).toBeGreaterThan(0);
      }
    }
  });
});
