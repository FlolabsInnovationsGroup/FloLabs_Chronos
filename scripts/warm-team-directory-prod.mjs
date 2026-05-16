import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const users = JSON.parse(readFileSync(join(process.cwd(), 'test_assets', 'test_users.json'), 'utf8'));
const base = (process.env.PLAYWRIGHT_BASE_URL || users.baseUrl || 'https://athensgreecemarathon.com').replace(/\/$/, '');
const admin = users.users.find((u) => u.role === 'admin');
const email = admin.emails?.[0] ?? admin.email;
const password = admin.password;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
await page.locator('#email').fill(email);
await page.locator('#password').fill(password);
await page.getByRole('button', { name: 'Sign In' }).click();
await page.waitForURL(/\/timer/, { timeout: 240_000 });

const result = await page.evaluate(async () => {
  const started = Date.now();
  const res = await fetch('/api/notion/team-members/search?q=&limit=10', { signal: AbortSignal.timeout(600_000) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, elapsedMs: Date.now() - started, pages: body.pages?.length ?? 0, error: body.error };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(result.status === 200 ? 0 : 1);
