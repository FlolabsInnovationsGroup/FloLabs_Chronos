# QA checklist — FloLabs Chronos

Use this after changes that touch **identity**, **the shared Neon database**, or **cross-app** behavior. Production validation should follow **`AGENT.md` / `CLAUDE.md`** (browser against deployed App Runner).

## Shared database (`flolabs_users`)

- [ ] Sign in as a normal member: timer start/stop, week view, and reports load without 500s.
- [ ] **Settings → profile**: change display name; reload Chronos and confirm the name matches the row in Postgres (`flolabs_users.name`) without a separate sync step.
- [ ] **Settings → emails** (`/api/settings/emails`): primary + aliases list matches expectations for the same `user_id` in `user_email_aliases`.
- [ ] **Team → members** (`/api/teams/[id]/members`): names and `notionTeamMemberId` come from `flolabs_users` only (no stale overlay from a removed `applicants` join).
- [ ] **Reports** (page + `/api/reports`): search matches entry description, project, tag, and **owner / applicant** display names on unified rows.
- [ ] **Forgot password / reset**: reset form shows email for the token’s `user_id` row in `flolabs_users`; completing reset updates `flolabs_users.password` only.
- [ ] **Admin duplicate reviews** (`/api/applicants/duplicate-reviews`): primary/duplicate payloads hydrate from `flolabs_users` ids.

## Applicant status (`flolabs_users.status`)

- [ ] **Users → Edit user** (admin/HR): Applicant status is **read-only** and matches Hephaestus HR for the same person.
- [ ] On Hephaestus HR, set a test lead to **Graduated** or **Terminated**; confirm they **disappear** from Chronos Users and **cannot log in** to Chronos.
- [ ] Hephaestus HR **Edit lead → Applicant status** dropdown includes all canonical values; saving updates Postgres `flolabs_users.status`.

## Regression (quick)

- [ ] `pnpm exec tsc --noEmit` and `pnpm run build` pass locally.
- [ ] Cron-style routes that touch people (`daily-summary`, `teams-sync`) still authorize with `CRON_SECRET` and do not reference dropped tables.
