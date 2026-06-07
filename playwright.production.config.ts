import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

/**
 * Production-only E2E (no local dev server).
 * Base URL resolution: `PLAYWRIGHT_BASE_URL` → `baseUrl` in `test_assets/test_users.json` →
 * `NEXTAUTH_URL` (env) → `NEXTAUTH_URL` from `.env.production.local` / `.env.local` → default.
 * Put the live Chronos origin in `test_users.json` so a stale shell `NEXTAUTH_URL` (e.g. old `*.vercel.app`)
 * does not override it.
 *
 * Run: `pnpm run test:e2e:production`
 */
function parseNextAuthUrlFromEnvFile(rel: string): string | undefined {
  const path = join(process.cwd(), rel);
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^NEXTAUTH_URL\s*=\s*["']?([^"']+)["']?\s*$/);
    if (m?.[1]?.startsWith("http")) return m[1].trim();
  }
  return undefined;
}

function baseUrlFromTestUsersJson(): string | undefined {
  const path = join(process.cwd(), "test_assets", "test_users.json");
  if (!existsSync(path)) return undefined;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as { baseUrl?: string };
    const u = data.baseUrl?.trim();
    return u?.startsWith("http") ? u.replace(/\/$/, "") : undefined;
  } catch {
    return undefined;
  }
}

/** `test_users.json` wins over shell `NEXTAUTH_URL` so a stale `*.vercel.app` in env does not break runs. */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL?.trim() ||
  baseUrlFromTestUsersJson() ||
  process.env.NEXTAUTH_URL?.trim() ||
  parseNextAuthUrlFromEnvFile(".env.production.local") ||
  parseNextAuthUrlFromEnvFile(".env.local") ||
  "https://athensgreecemarathon.com";

function chromiumHostResolverArgs(url: string): string[] {
  if (process.platform === "win32") return [];
  try {
    const host = new URL(url).hostname;
    const firstIp = execSync(`getent hosts ${host} | awk 'NR==1 {print $1}'`, { encoding: "utf8" }).trim();
    return firstIp ? [`--host-resolver-rules=MAP ${host} ${firstIp}`] : [];
  } catch {
    return [];
  }
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  timeout: 300_000,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: chromiumHostResolverArgs(baseURL) },
      },
    },
  ],
});
