# Chronos live E2E testing

This repository treats the live website as the only reliable functional test surface for user-facing fixes.

## Source of truth

- Test only against the deployed Chronos website, not a local Next.js server.
- Use only accounts listed in `test_assets/test_users.json`.
- A timer/session fix is accepted only after the live UI can:
  1. sign in as a listed test user,
  2. open `/timer`,
  3. enter a description,
  4. select a project,
  5. start a session,
  6. keep it running for at least 1 second,
  7. stop the session,
  8. see the created time entry persisted in the visible recent entries list.

## Production URL

The confirmed AWS App Runner URL is:

```text
https://hcmsmnfq5q.us-east-1.awsapprunner.com
```

If `test_assets/test_users.json` contains a stale or custom `baseUrl`, override it explicitly with `PLAYWRIGHT_BASE_URL`.

## Install/browser prerequisites

From the repository root:

```bash
pnpm install
npx playwright install chromium
sudo env PATH="$PATH" npx playwright install-deps chromium
```

The WSL browser dependency step is required when Chromium fails with missing shared libraries such as `libnspr4.so`.

## Run the session lifecycle acceptance test

Run the primary Chronos timer/session acceptance test:

```bash
PLAYWRIGHT_BASE_URL=https://hcmsmnfq5q.us-east-1.awsapprunner.com \
  npx playwright test -c playwright.production.config.ts \
  e2e/session-lifecycle-production.spec.ts --project=chromium
```

By default this chooses the first Oliver/Human Resources account from `test_assets/test_users.json`.

To target a specific listed email:

```bash
PLAYWRIGHT_BASE_URL=https://hcmsmnfq5q.us-east-1.awsapprunner.com \
E2E_EMAIL='oliver.abreu@flolabsrd.com' \
  npx playwright test -c playwright.production.config.ts \
  e2e/session-lifecycle-production.spec.ts --project=chromium
```

To run every listed account/email:

```bash
PLAYWRIGHT_BASE_URL=https://hcmsmnfq5q.us-east-1.awsapprunner.com \
E2E_ALL_ACCOUNTS=1 \
  npx playwright test -c playwright.production.config.ts \
  e2e/session-lifecycle-production.spec.ts --project=chromium
```

## Reading failures

The test stores Playwright traces and screenshots under `test-results/`.

For a failed trace:

```bash
npx playwright show-trace <path-to-trace.zip>
```

The session lifecycle spec also attaches timer/entry HTTP diagnostics when the browser reaches the app. Use these diagnostics to identify whether failure occurred at login, project selection, `/api/timer/start`, `/api/timer/stop`, or entry persistence.

## Deployment and validation loop

For a code fix:

1. Make the smallest code change.
2. Run static gates:
   ```bash
   pnpm exec tsc --noEmit
   git diff --check -- <changed-files>
   ```
3. Commit only the relevant files.
4. Push to `main` so GitHub Actions deploys to AWS App Runner.
5. Confirm `/api/health` reports the deployed commit.
6. Run the live Playwright command above.
7. If the session lifecycle test fails, inspect the trace/logs, patch again, redeploy, and retest. Do not call the fix complete until the live UI test passes.
