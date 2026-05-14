import { test, expect } from "@playwright/test";
import { loadTestUsers } from "./lib/production-auth";

// These are injected by the CI job from SSM. When absent the tests are skipped.
const testEmail = process.env.E2E_RESET_TEST_EMAIL?.trim() ?? "";
const testSecret = process.env.E2E_RESET_TEST_SECRET?.trim() ?? "";

const users = loadTestUsers();
const adminUser = users.find((u) => u.role.toLowerCase() === "admin");
const memberUser = users.find((u) => u.role.toLowerCase() === "member");

test.describe("Forgot password (production)", () => {
  test.setTimeout(120_000);

  // ── UI smoke tests ──────────────────────────────────────────────────────────

  test("UI: forgot-mode renders the email form", async ({ page }) => {
    await page.goto("/register?forgot=1", { waitUntil: "domcontentloaded" });
    await expect(page.locator("input#email, input[type='email'], input[placeholder*='email' i]").first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("UI: submitting shows success message for any email address", async ({ page }) => {
    await page.goto("/register?forgot=1", { waitUntil: "domcontentloaded" });

    const emailInput = page
      .locator("input#email, input[type='email'], input[placeholder*='email' i]")
      .first();
    await emailInput.waitFor({ state: "visible", timeout: 20_000 });
    await emailInput.fill("no-such-user@example.com");

    const submitButton = page.getByRole("button", { name: /send|reset|submit/i });
    await submitButton.click();

    await expect(
      page.getByText(/reset email sent|check your inbox|if.*account exists/i),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("UI: login page has forgot-password link", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: /forgot.*password/i })).toBeVisible({ timeout: 15_000 });
  });

  // ── API test-mode: verifies the full path through to Resend ────────────────

  test("API test-mode: reset token created and email accepted by Resend", async ({ request }) => {
    test.skip(!testEmail || !testSecret, "E2E_RESET_TEST_EMAIL / E2E_RESET_TEST_SECRET not set");

    const res = await request.post("/api/auth/forgot-password", {
      data: { email: testEmail },
      headers: { "x-reset-password-test-secret": testSecret },
    });

    expect(res.status(), `forgot-password API returned ${res.status()}: ${await res.text()}`).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      test?: { resendEmailId: string | null; resetToken: string; expiresAt: string };
    };

    expect(body.ok).toBe(true);
    expect(body.test, "Expected test-mode payload in response").toBeDefined();
    expect(typeof body.test?.resetToken).toBe("string");
    expect(body.test?.resetToken.length).toBeGreaterThan(0);
    // resendEmailId is null only when Resend rejects — treat null as a delivery failure.
    expect(
      body.test?.resendEmailId,
      "resendEmailId is null — Resend rejected the email (check domain verification or API key)",
    ).not.toBeNull();
  });

  // ── Anti-enumeration ───────────────────────────────────────────────────────

  test("API: unknown email returns ok=true without error (anti-enumeration)", async ({ request }) => {
    const res = await request.post("/api/auth/forgot-password", {
      data: { email: "totally-unknown-xyz-9999@example.com" },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(true);
    expect(body.error).toBeUndefined();
  });

  // ── Any user — regardless of isActive — should be able to trigger a reset ──

  test("API: active admin user gets a reset token (cooldown proves token was created)", async ({ request }) => {
    test.skip(!adminUser, "No admin user in test_assets/test_users.json");
    const email = adminUser!.emails
      ? (Array.isArray(adminUser!.emails) ? adminUser!.emails[0] : adminUser!.emails)
          .split(",")[0]
          .trim()
      : "";
    test.skip(!email, "Admin user has no email");

    const first = await request.post("/api/auth/forgot-password", { data: { email } });
    expect(first.status()).toBe(200);

    const second = await request.post("/api/auth/forgot-password", { data: { email } });
    expect(second.status()).toBe(200);
    const secondBody = (await second.json()) as { ok: boolean; cooldown?: boolean };
    expect(secondBody.ok).toBe(true);
    expect(
      secondBody.cooldown,
      "Expected cooldown=true on second request — a live token must exist",
    ).toBe(true);
  });
});
