import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const users = JSON.parse(readFileSync(join(process.cwd(), 'test_assets', 'test_users.json'), 'utf8'));
const admin = users.users.find((u) => u.role === 'admin');
const base = (process.env.PLAYWRIGHT_BASE_URL || users.baseUrl || 'https://athensgreecemarathon.com').replace(/\/$/, '');

const email = admin.emails?.[0] ?? admin.email;
const password = admin.password;

const loginRes = await fetch(`${base}/api/auth/callback/credentials`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    email,
    password,
    csrfToken: '',
    callbackUrl: `${base}/timer`,
    json: 'true',
  }),
  redirect: 'manual',
});

console.log('login status', loginRes.status);
