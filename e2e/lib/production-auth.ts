import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export type TestUserEntry = { email?: string; emails?: string[]; password: string; role: string };

export function extractEmails(user: TestUserEntry): string[] {
  const direct = typeof user.email === "string" ? [user.email] : [];
  const fromList = Array.isArray(user.emails) ? user.emails : [];
  const normalized = [...direct, ...fromList]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(normalized)];
}

export function loadTestUsers(): TestUserEntry[] {
  const path = join(process.cwd(), "test_assets", "test_users.json");
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf8")) as { users?: TestUserEntry[] };
  return Array.isArray(data.users) ? data.users : [];
}

/** Sign in; lands on /timer on success. Uses #email / #password (controlled React inputs). */
export async function signInProduction(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#email")).toBeVisible({ timeout: 90_000 });
  await page.locator("#email").click();
  await page.locator("#email").clear();
  await page.locator("#email").pressSequentially(email, { delay: 5 });
  await page.locator("#password").click();
  await page.locator("#password").clear();
  await page.locator("#password").pressSequentially(password, { delay: 5 });
  await page.getByRole("button", { name: "Sign In" }).click();

  const authTimeoutMs = 180_000;
  /** Do not use Promise.race with waitForURL — on timeout it rejects and hides credential error messages. */
  try {
    await page.waitForURL(/\/timer/, { timeout: authTimeoutMs });
    return;
  } catch {
    /* still on /login or slow client navigation */
  }

  if (await page.getByText("Invalid email or password.").isVisible().catch(() => false)) {
    throw new Error(`Sign-in failed (invalid credentials) for ${email}.`);
  }
  if (await page.getByText("Something went wrong. Please try again.").isVisible().catch(() => false)) {
    throw new Error(`Sign-in failed (server error) for ${email}.`);
  }
  if (page.url().includes("/timer")) {
    return;
  }
  throw new Error(
    `Sign-in timed out (expected redirect to /timer) for ${email}. Still at: ${page.url()}`
  );
}
