import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

type TestUser = { emails?: string[]; password?: string; role?: string };

function readTestUsers(): { baseUrl?: string; users?: TestUser[] } {
  const path = join(process.cwd(), "test_assets", "test_users.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as { baseUrl?: string; users?: TestUser[] };
}

export function chronosBaseUrl(): string {
  const fromEnv = process.env.CHRONOS_BASE_URL?.trim();
  if (fromEnv?.startsWith("http")) return fromEnv.replace(/\/$/, "");
  const fromFile = readTestUsers().baseUrl?.trim();
  if (fromFile?.startsWith("http")) return fromFile.replace(/\/$/, "");
  return "https://athensgreecemarathon.com";
}

export function hephaestusBaseUrl(): string {
  const fromEnv = process.env.HEPHAESTUS_BASE_URL?.trim();
  if (fromEnv?.startsWith("http")) return fromEnv.replace(/\/$/, "");
  return "https://efestos.international";
}

export function credentialsForRole(role: string): { email: string; password: string } {
  const u = readTestUsers().users?.find((user) => user.role === role);
  const email = (u?.emails?.[0] ?? "").split(",")[0].trim();
  return { email, password: u?.password ?? "" };
}

export async function loginHephaestusHr(page: Page, baseUrl: string) {
  const creds = { email: "zoom@flomadlabs.com", password: "gq2A1xZ^CdMM#uUpJnfc" };

  await page.context().clearCookies();
  const res = await page.request.post(`${baseUrl}/api/auth/preview-login`, {
    data: { email: creds.email, password: creds.password },
  });
  if (!res.ok()) {
    throw new Error(`Hephaestus preview-login HTTP ${res.status()}`);
  }
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!body.ok) {
    throw new Error(`Hephaestus preview-login failed: ${body.error ?? "ok=false"}`);
  }
  await page.goto(`${baseUrl}/me/hr?status=joined`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator('select[name="status"]').first().waitFor({ state: "visible", timeout: 120_000 });
}

export async function loginChronosAdmin(page: Page, baseUrl: string) {
  const { email, password } = credentialsForRole("admin");
  const fallback = { email: "pm@flolabsinnovations.com", password: "flchron2026" };
  const creds = email && password ? { email, password } : fallback;

  await page.context().clearCookies();
  const csrfRes = await page.request.get(`${baseUrl}/api/auth/csrf`);
  if (!csrfRes.ok()) {
    throw new Error(`Chronos csrf HTTP ${csrfRes.status()}`);
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrfToken) {
    throw new Error("Chronos csrf token missing");
  }

  const signInRes = await page.request.post(`${baseUrl}/api/auth/callback/credentials`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({
      csrfToken,
      email: creds.email.toLowerCase().trim(),
      password: creds.password,
      redirect: "false",
      json: "true",
    }).toString(),
  });
  const signInText = await signInRes.text();
  if (!signInRes.ok()) {
    throw new Error(`Chronos sign-in HTTP ${signInRes.status()}: ${signInText.slice(0, 200)}`);
  }
  const contentType = signInRes.headers()["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    const signInBody = JSON.parse(signInText) as { error?: string };
    if (signInBody.error) {
      throw new Error(`Chronos sign-in failed: ${signInBody.error}`);
    }
  }

  const storage = await page.request.storageState();
  await page.context().addCookies(storage.cookies);
  await page.goto(`${baseUrl}/team`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForURL(/\/team/, { timeout: 60_000 });
}
