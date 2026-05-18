# QA Checklist — FloLabs Chronos

Production validation runs against **`https://hcmsmnfq5q.us-east-1.awsapprunner.com`** (or the custom domain `https://athensgreecemarathon.com`). All E2E specs use Playwright against the live App Runner deployment. See `CLAUDE.md` and `AGENT.md` for the deploy-and-test workflow.

Legend: **[AUTO]** = covered by an E2E spec, **[MANUAL]** = requires a human tester.

---

## Timer

| Check | Coverage |
|---|---|
| Start session, wait ≥1 s, assign project, stop — entry persists in "Last 7 Days" | **[AUTO]** `session-lifecycle-production.spec.ts` |
| TopBar shows live `HH:MM:SS` while a session is running | **[AUTO]** `topbar-timer-duration.spec.ts` |
| TopBar duration persists across page navigation (e.g. to `/reports` and back) | **[AUTO]** `topbar-timer-duration.spec.ts` |
| TopBar duration disappears immediately after stopping the session | **[AUTO]** `topbar-timer-duration.spec.ts` |
| `/api/timer/active` returns `{ userId, startedAt, … }` (numeric) while running | **[AUTO]** `timer-recovery.spec.ts` |
| `/api/timer/active` returns null/empty after stop | **[AUTO]** `timer-recovery.spec.ts` |
| Stale active timer from a crashed session is cleaned up on next sign-in | **[MANUAL]** force-kill tab mid-session, reload, confirm "stop" clears state |

---

## Reports

| Check | Coverage |
|---|---|
| `/reports` loads without 500; heading visible | **[AUTO]** `reports-page.spec.ts` (also covered by `test-accounts-users-reports.spec.ts`) |
| At least one entry row or explicit empty-state message is shown | **[AUTO]** `reports-page.spec.ts` |
| Date-range filter change re-renders without error | **[AUTO]** `reports-page.spec.ts` |
| Search matches entry description, project, tag, and owner display name | **[MANUAL]** enter known terms; verify filtered rows |
| Hourly/total stats (`Total Hours`) visible for the selected range | **[AUTO]** `test-accounts-users-reports.spec.ts` (member account) |
| Admin sees all users' entries; member sees only own entries | **[MANUAL]** compare rows between roles |

---

## Navigation / Page Load

| Check | Coverage |
|---|---|
| `/timer`, `/reports`, `/settings`, `/tags`, `/projects`, `/team` all load without crash | **[AUTO]** `nav-pages-smoke.spec.ts` |
| Member visiting `/team` is redirected to `/timer` (not an error page) | **[AUTO]** `nav-pages-smoke.spec.ts` + `test-accounts-users-reports.spec.ts` |
| Admin visiting `/control` loads settings without "Failed to load" banner | **[AUTO]** `control-production.spec.ts` + `all-accounts-production.spec.ts` |
| Control page Notion Database ID field matches `/api/control` response | **[AUTO]** `control-production.spec.ts` |

---

## Task Search (Notion)

| Check | Coverage |
|---|---|
| `/api/tasks?q=a` returns `{ tasks: [], meta: { taskSearchConfigured } }` | **[AUTO]** `task-search.spec.ts` + `all-accounts-production.spec.ts` |
| Task picker in timer form reflects the API response (results or "not configured" hint) | **[AUTO]** `task-search.spec.ts` |

---

## Users / Team

| Check | Coverage |
|---|---|
| `/api/users` returns 200 after sign-in | **[AUTO]** `users-page-production.spec.ts` + `test-accounts-users-reports.spec.ts` |
| HR / Human Resources role sees Users page with search box, no "service unavailable" banner | **[AUTO]** `test-accounts-users-reports.spec.ts` + `all-accounts-production.spec.ts` |
| Admin and HR see the same user IDs from `/api/users` | **[AUTO]** `test-accounts-users-reports.spec.ts` |
| Users edit modal shows **read-only** Applicant status (no editable `<select>`) | **[AUTO]** `applicant-status-readonly.spec.ts` |
| Applicant status label references "Hephaestus International HR" | **[AUTO]** `applicant-status-readonly.spec.ts` |
| Terminated/Graduated user cannot log in to Chronos | **[MANUAL]** set status in Hephaestus HR, attempt Chronos login |

---

## Authentication & Password Reset

| Check | Coverage |
|---|---|
| All `test_users.json` accounts can sign in | **[AUTO]** `all-accounts-production.spec.ts` + `test-accounts-users-reports.spec.ts` |
| Login page has "Forgot password" link | **[AUTO]** `forgot-password-production.spec.ts` |
| Forgot-password form accepts any email without leaking account existence | **[AUTO]** `forgot-password-production.spec.ts` |
| Reset token is created and Resend accepts the email (test-mode API) | **[AUTO]** `forgot-password-production.spec.ts` |
| Second reset request within cooldown returns `cooldown: true` | **[AUTO]** `forgot-password-production.spec.ts` |
| Invite-only registration: `/register?invite=<token>` requires a valid token | **[MANUAL]** attempt registration with expired/invalid token |
| Password reset page (`/register?reset=<token>`) sets new password | **[MANUAL]** use test-mode token from API; complete reset; sign in |

---

## Settings & Profile

| Check | Coverage |
|---|---|
| Settings → Appearance (Light/Dark/System) persists across reload | **[MANUAL]** toggle each mode, verify `html.dark` class and localStorage |
| Settings → Profile: display name change is reflected in Postgres without manual sync | **[MANUAL]** change name, reload, confirm DB row via `/api/users` |
| Settings → Emails: primary + aliases list matches `user_email_aliases` for the user | **[MANUAL]** compare UI list with DB query |

---

## Tags

| Check | Coverage |
|---|---|
| Tags page loads for all roles (no crash) | **[AUTO]** `nav-pages-smoke.spec.ts` |
| Normal user sees only their own tags | **[MANUAL]** create tag as member; confirm admin sees it with creator name |
| Admin sees all tags with creator names | **[MANUAL]** verify on Tags admin view |
| Multi-tag time entries: adding/removing tags works via `TagMultiSelect` | **[MANUAL]** create entry with 2 tags; check `time_entry_tags` via reports |

---

## Projects

| Check | Coverage |
|---|---|
| Projects page loads (no crash) | **[AUTO]** `nav-pages-smoke.spec.ts` |
| Only admins see create/edit/archive/delete controls | **[MANUAL]** sign in as member; verify controls hidden |
| Deleting a project shows confirmation modal with Cancel highlighted | **[MANUAL]** attempt delete; verify modal UX |

---

## Notion Sync

| Check | Coverage |
|---|---|
| Teams sync cron (`/api/cron/teams-sync`) authorized with `CRON_SECRET` | **[MANUAL]** call with valid and invalid secret; assert 401 vs 200 |
| Invite form only shows teams with `isActive = true` | **[MANUAL]** archive a team in Notion; confirm it disappears from invite dropdown after next sync |

---

## Build & Type-Check

| Check | Coverage |
|---|---|
| `pnpm exec tsc --noEmit` passes | **[MANUAL]** run before merging to main |
| `pnpm run build` passes | **[MANUAL]** run before merging to main |
| Cron routes (`daily-summary`, `teams-sync`) still authorize with `CRON_SECRET` | **[MANUAL]** smoke-call each with the secret |
