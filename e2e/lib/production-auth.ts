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

/** Sign in via NextAuth API; lands on /timer on success. */
export async function signInProduction(page: Page, email: string, password: string) {
  await page.context().clearCookies();

  const csrfRes = await page.request.get("/api/auth/csrf");
  if (!csrfRes.ok()) {
    throw new Error(`Sign-in csrf HTTP ${csrfRes.status()} for ${email}.`);
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrfToken) {
    throw new Error(`Sign-in csrf token missing for ${email}.`);
  }

  const signInRes = await page.request.post("/api/auth/callback/credentials", {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({
      csrfToken,
      email: email.toLowerCase().trim(),
      password,
      redirect: "false",
      json: "true",
    }).toString(),
  });

  const signInText = await signInRes.text();
  const location = signInRes.headers().location ?? "";
  if (location.includes("error=CredentialsSignin")) {
    throw new Error(`Sign-in failed (invalid credentials) for ${email}.`);
  }
  if (!signInRes.ok() && signInRes.status() !== 302) {
    throw new Error(`Sign-in HTTP ${signInRes.status()} for ${email}: ${signInText.slice(0, 200)}`);
  }
  const contentType = signInRes.headers()["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    const signInBody = JSON.parse(signInText) as { error?: string; url?: string };
    if (signInBody.error) {
      throw new Error(`Sign-in failed (${signInBody.error}) for ${email}.`);
    }
    if (signInBody.url?.includes("error=CredentialsSignin")) {
      throw new Error(`Sign-in failed (invalid credentials) for ${email}.`);
    }
  }

  const storage = await page.request.storageState();
  await page.context().addCookies(storage.cookies);

  const sessionRes = await page.request.get("/api/auth/session");
  const session = (await sessionRes.json()) as { user?: { email?: string } };
  if (!session.user?.email) {
    throw new Error(`Sign-in failed (no session) for ${email}.`);
  }

  await page.goto("/timer", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await expect(page.getByPlaceholder("Search Notion tasks…")).toBeVisible({ timeout: 90_000 });
}
