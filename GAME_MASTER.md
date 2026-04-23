# GAME_MASTER.md — FloLabs Chronos Development Tracker

## Project Status
**Date:** 2026-04-05
**Phase:** V1 feature-complete → V1.1 active development
**Stack:** Next.js 16 + Drizzle + Neon Postgres + Redis + NextAuth v5
**URL:** https://athensgreecemarathon.com
**Vercel project:** flo-labs-chronos (team: flomad-dev)

---

## Source Of Truth

- `ARCHITECTURE.md` defines the target V1 operating model
- `CLAUDE.md` defines the implementation guardrails for coding agents
- This file tracks what's done, what's next, and handoff context

---

## Completed

### Schema and Auth Foundation ✅
- [x] `teams` table
- [x] `invitations` table
- [x] `users` extended with `teamId` and `isActive`
- [x] Three roles: `admin | team_lead | member`
- [x] Inactive users blocked from authenticating
- [x] Shared permission helpers in `src/lib/permissions.ts`

### Invite-Only Onboarding ✅
- [x] Token-based registration (no open signup)
- [x] Invitation validation endpoint (`GET /api/auth/invitation`)
- [x] Invitation creation endpoint (`POST /api/invitations`)
- [x] Shareable invite URLs even without email delivery
- [x] Duplicate email prevention
- [x] Invitation-created Notion Team Member pages now attempt to apply a Notion template (`NOTION_TEAM_MEMBER_TEMPLATE_ID` when set, otherwise the data source default template) with safe fallback to plain page creation
- [x] New invitation-created Team Member pages now also create a linked Onboarding database page and attach it through the Team Member page's `Onboarding` relation
- [x] Invite and Edit Member modals use a Notion Team Members search picker (explicit page or create-new); `invitations.notion_team_member_id` carries the link through registration — no automatic email/name matching for Team Member pages
- [x] `teams-sync` sets `team_memberships` from each user's linked Notion Team Member page (`Team` relation) only when `users.notion_team_member_id` is set; unlinked users keep invite/admin memberships in Chronos
- [x] Reused Team Member pages still receive minimal safe repairs (email/teams/onboarding) when chosen explicitly for an invite
- [x] Confirmed limitation: Notion's public API does not expose a documented guest-invite/share-page endpoint, so Chronos cannot automate Floffice guest invites

### Team Visibility ✅
- [x] Admins see all teams and members
- [x] Team leads see members and data for every team they belong to (union of `team_memberships`)
- [x] Members see only their team assignment(s)
- [x] Team page renders different data by role; on md+ screens the Users/Invitations **Actions** column stays sticky on the right when the table scrolls horizontally

### Project Permissions ✅
- [x] All users can read projects
- [x] Create/edit/archive/delete restricted to admins in API and UI
- [x] Visual icon picker with searchable Material icons
- [x] Project deletion deletes linked time entries (with confirmation warning)

### Report Permissions ✅
- [x] Admin sees all report data
- [x] Team lead sees team-scoped report data, tag filters for all members in scope, and can edit/delete/bulk-manage teammates’ entries like admins (within that scope)
- [x] Member sees own data only
- [x] Filter dropdowns respect scope

### UI Polish ✅
- [x] Delayed tooltip component (3s hover) for icon-only buttons
- [x] Custom dropdown menus (`DropdownSelect`) replacing native selects app-wide
- [x] Modals scroll properly and fit the screen
- [x] Vellum Ink design tokens used consistently

### Admin Destructive Controls ✅
- [x] Disable invitation links
- [x] Delete invitation links
- [x] Delete team members (when no time entries exist)
- [x] Delete projects (cascades to time entries)
- [x] All destructive modals: Cancel highlighted, action is danger variant

### Time Entry Management ✅
- [x] Bulk operations API (`POST /api/entries/bulk`): delete or change project
- [x] Multi-select entries with checkboxes and floating action bar
- [x] Select-all checkbox at top of entry list
- [x] Individual entry edit (description, project, tags)
- [x] Running timer project can be reassigned from the active timer UI and persists through stop/sync flow
- [x] Detailed entry list on reports page with full management controls

### Reports Search and Filtering ✅
- [x] 2-second debounced search input
- [x] Search across descriptions, project names, tag names, user names (ILIKE)
- [x] Configurable page size: 25, 50, 100, 250, 500, or All

### Per-User Tags with Multi-Tag Entries ✅
- [x] Tags are per-user (unique per name + userId)
- [x] No color, no icon on tags
- [x] Many-to-many join table `time_entry_tags`
- [x] `TagMultiSelect` component with inline tag creation
- [x] Tags page in sidebar for management
- [x] Admins see all tags with creator names
- [x] Tag deletion removes associations, preserves entries
- [x] User deletion cascades to tags
- [x] Database migration script (`scripts/migrate-tags.ts`)

### Project Colors ✅
- [x] Updated palette: deep teal, slate, warm red, orange, sky blue, marine blue, violet, light green

### Domain & Infra ✅
- [x] `athensgreecemarathon.com` connected to Vercel project, DNS verified
- [x] `NEXTAUTH_URL` updated to `https://athensgreecemarathon.com`, redeployed
- [x] `VERCEL_TOKEN` stored in `.env.local` and `.env.production.local`

---

## ✅ Completed Sprint — V1.1

### Feature 1: Time Entry Start/End Editing Lock ✅

- `editedField` column added to `time_entries` (migration: `scripts/migrate-edited-field.ts`)
- PATCH `/api/entries/[id]` enforces lock: rejects edits to locked field, recomputes `durationMs`
- `TimeEntry` type updated with `editedField: 'start' | 'end' | null`
- `EntryForm` shows 🔒 tooltip on locked field; hides time fields for active timers

### Feature 2: Notion + Discord Sync (replaces Python Lambda) ✅

- `NOTION_ONBOARDINGS_DB_ID` added to `.env.local` and `.env.production.local` for the linked Onboarding database
- `src/lib/notion.ts` — `buildNotionEntryProperties`, `syncEntryToNotionFull`, `markEntryDeleted`, `queryNotionEntriesWindow` (Team Member relation uses stored `notion_team_member_id` only)
- `src/lib/discord.ts` — added `sendDiscordText`, `buildEntryAddedMessage`, `buildEntryEditedMessage`, `buildEntryDeletedMessage`
- `src/lib/redis-cache.ts` — thin Redis get/set wrapper for caching the team name index
- `src/app/api/cron/notion-sync/route.ts` — full rewrite: upsert new/edited entries, detect deletes, fire Discord notifications fire-and-forget
- `ARCHITECTURE.md` — documented start/end lock rule + full Notion Sync & Discord Notifications section

---

### Feature 3: Teams Import from Notion (replaces manual team creation)

**Spec:**
Teams in FloLabs Chronos must be automatically imported and kept in sync from the Notion Teams database. Manual team creation in the UI must be removed or locked to admins as a fallback only.

**Notion Teams DB:** `9828e33b94e64dcba86f8b4ad7a21a23`

**Relevant Notion properties to sync:**
| Notion property | Chronos `teams` column |
|---|---|
| `Full Name` (title) | `name` |
| `Full Name` slugified | `slug` |
| `Status` (status) | `isActive` — Active → true, others → false |
| `General Webhook` (url) | new column `generalWebhookUrl TEXT` |
| `Meetings Webhook` (url) | new column `meetingsWebhookUrl TEXT` |
| Notion page ID | new column `notionPageId TEXT UNIQUE` |

**Schema changes:**
- Add to `teams` table: `notionPageId TEXT UNIQUE`, `generalWebhookUrl TEXT`, `meetingsWebhookUrl TEXT`, `isActive BOOLEAN NOT NULL DEFAULT true`
- Write migration script `scripts/migrate-teams-notion.ts`

**New cron: `/api/cron/teams-sync`** (schedule: `*/15 * * * *` — every 15 min)
- Auth with `CRON_SECRET`
- Query Notion Teams DB (paginate all pages)
- For each page: upsert into `teams` by `notionPageId` (INSERT … ON CONFLICT UPDATE name, slug, isActive, generalWebhookUrl, meetingsWebhookUrl, updatedAt)
- Soft-deactivate any Chronos team whose `notionPageId` no longer appears in Notion (set `isActive = false`)
- Return `{ upserted, deactivated, errors }`

**New env var:**
```
NOTION_TEAMS_DB_ID=9828e33b94e64dcba86f8b4ad7a21a23
```

**UI changes:**
- Remove the "Create team" button/form from the Team management page (admins can no longer manually create teams — they manage teams in Notion)
- Teams list should show `isActive` status badge (Active / Inactive)
- Team invite form: only show active teams in the team selector

**`vercel.json` addition:**
```json
{ "path": "/api/cron/teams-sync", "schedule": "*/15 * * * *" }
```

**Files to touch:**
- `src/lib/db/schema.ts` — add new columns to `teams`
- `scripts/migrate-teams-notion.ts` — migration
- `src/app/api/cron/teams-sync/route.ts` — new file
- `vercel.json` — add cron entry
- Team page UI — remove create team button, add isActive badge
- Invitation form — filter to active teams only
- `ARCHITECTURE.md` — document Notion-driven team sync
- `CLAUDE.md` — note NOTION_TEAMS_DB_ID

**Status:** ✅ Completed (cron, schema, team page UI, invite active-team filter, docs)

---

### Feature 4: Light / dark theme ✅

- `src/app/globals.css` — full light (`:root`) and dark (`html.dark`) palettes as `--c-*`; `@theme inline` exposes them to Tailwind; `@custom-variant dark` scopes `dark:` to `html.dark`
- `src/components/theme/ThemeScript.tsx` — `beforeInteractive` script: `localStorage` key `chronos-theme`, fallback `prefers-color-scheme`, toggles `html.dark` to avoid flash
- `src/components/theme/ThemeToggle.tsx` — persists choice, used in `TopBar` and Settings → Appearance
- `src/app/layout.tsx` — injects `ThemeScript`
- Semantic utilities app-wide (`bg-background`, `text-on-background`, `bg-surface-container-*`, `text-primary`, …); optional `scripts/apply-semantic-theme-classes.mjs` for migrating legacy hex classes
- `src/components/brand/FlolabsMark.tsx` — sidebar / mobile header mark uses `fill="var(--c-primary)"` so the logo matches theme primary (e.g. `#8ecbce` in dark)

---

## Recent Updates

- 2026-04-22: Phase 3 identity refactor: aligned timer PATCH/stop running-entry lookup with applicant-owned time entries, including discard cleanup, so active DB timer rows no longer depend on `time_entries.user_id` alone. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: moved Notion sync and entry lifecycle hydration to applicant-first owner resolution, preferring `time_entries.applicant_id` and falling back to `users.id` only for non-backfilled rows, so background sync/notification paths stop treating `users` as the canonical applicant bridge. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: aligned bulk entry ownership checks so self-owner bulk delete/change-project actions prefer `time_entries.applicant_id` and only fall back to `user_id` for non-backfilled rows; admin/team-lead bulk scopes still use Chronos user ids for now. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: moved discussion and reply actor display to applicant-first resolution via `chronosActorDisplay`, so discussion starter/resolver/reply author names prefer applicant identity and only fall back to `users` for non-backfilled rows. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: moved entry/report owner presentation to batched applicant-first resolution via `chronosEntryOwnerDisplayMap`, so API entries, report labels, CSV export, and the dashboard reports page no longer treat `users.name/email` as the canonical owner profile for backfilled rows. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: aligned users/team directory overlays with applicant-canonical identity, so `GET /api/users` and `GET /api/teams/[id]/members` prefer linked applicant profile/status fields while retaining `users` fallback for legacy rows. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: aligned the timer dashboard with applicant-canonical identity, so week/recent entries, initial discussions/replies, and weekly target hours now prefer applicant-linked profile data before falling back to legacy `users` fields. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: aligned daily summary identity so the cron summary recipient name and entry owner payloads now prefer linked applicant identity, with legacy `users` fallback for non-backfilled rows. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Deployment traceability follow-up: added immutable build metadata plumbing (`BUILD_COMMIT_SHA`, `BUILD_IMAGE_TAG`, `BUILD_IMAGE_DIGEST`, timestamp, `/api/health`) and updated the AWS deploy script to tag images by git SHA and capture the pushed ECR digest, so future AWS runtime validation can prove commit -> image -> App Runner lineage.
- 2026-04-23: Phase 3 identity refactor: made report search applicant-aware in both the API and dashboard page, so report filtering can find backfilled rows by canonical applicant name/email instead of relying only on legacy `users` fields. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: aligned `PATCH /api/users/[id]` response payloads with applicant-canonical identity so admin/team edits immediately return applicant-first profile fields instead of echoing only legacy `users` data. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: aligned the dashboard settings page with applicant-canonical identity so settings defaults prefer the linked applicant profile (name/email/profile picture) instead of relying only on session-backed legacy `users` data. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: aligned dashboard website-visit tracking with applicant-canonical identity by passing the linked applicant id into user-activity updates, while keeping Chronos-user/email fallback for legacy sessions. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: optimized Redis active-timer fanout by batching `timer:*` value reads with `mget` and shared parsing in `src/lib/redis.ts`, so users/team timer surfaces keep the current Chronos-user keyed compatibility layer without paying N+1 KV round-trips per active timer. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: added scoped Redis timer reads for users/team-member surfaces via `getActiveTimersForUserIds(...)`, so `/api/users` and `/api/teams/[id]/members` no longer scan every live timer key before filtering to the relevant Chronos users. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: scoped admin directory applicant counting to the visible Chronos user ids and moved the aggregation into SQL, so `/api/users` no longer scans the full applicants table to populate per-user applicant counts. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: scoped `/api/users` auto-provision passes to applicants missing `chronosUserId` directly in SQL, so the admin directory no longer reloads the full applicants table each pass just to find unlinked rows. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: batched linked-applicant lookups in `/api/cron/daily-summary`, so the daily summary cron no longer pays one applicant query per eligible user just to recover applicant-first identity. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: batched applicant-first actor resolution for discussions/replies via `chronosActorDisplayMap(...)`, so timer discussions and discussion API surfaces no longer do one identity lookup per actor row. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: collapsed repeated applicant writes in `PATCH /api/users/[id]` into a single applicant update payload, so admin user edits no longer fan out into redundant applicant update statements. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: removed the redundant `users` join from `GET /api/entries`, reusing the existing batched applicant-first owner resolver instead of fetching owner fallback data twice. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: removed the redundant `users` join from `GET /api/reports`, so reporting export/grouping now reuses the same batched applicant-first owner resolver instead of duplicating owner fallback fetches. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Phase 3 identity refactor: removed the redundant `users` joins from the timer dashboard week/recent history queries, so timer history now reuses the same batched applicant-first owner resolver as entries/reports instead of fetching owner fallback rows inline. See `notes/identity-refactor-phases.md`.
- 2026-04-23: Deployment automation: added `.github/workflows/deploy-aws-apprunner.yml` so pushes to `main` can build in GitHub Actions, push immutable git-SHA images to ECR, update App Runner, and verify `/api/health` against the deployed commit without relying on desktop Docker. Requires GitHub OIDC role + runtime secrets to be configured. See `README.md` and `CLAUDE.md`.
- 2026-04-23: Deployment automation: added `deploy/aws/setup-github-actions-deploy.ps1` plus IAM policy/trust artifacts and `deploy/aws/README-github-actions.md` so the missing GitHub OIDC provider, deploy role, and repo secrets can be bootstrapped in one step. This closes the main setup gap between the new Actions workflow and actual AWS-native deploy execution.
- 2026-04-23: Deployment automation: hardened the GitHub Actions AWS login step by using the known deploy role ARN directly in workflow env instead of routing it through a repo secret, after deploy runs failed inside `configure-aws-credentials` before reaching the build/push steps.
- 2026-04-23: Deployment automation: hardened App Runner deployment validation so the workflow now waits for the service to become idle before `update-service`, then waits for the expected image identifier to become current and only treats the deployment as validated once `/api/health` reports the matching commit SHA. This addresses the `OPERATION_IN_PROGRESS` race and makes post-deploy outcome checks systematic.
- 2026-04-23: Reset-password reliability: `POST /api/auth/forgot-password` now marks newly-created tokens used if email delivery fails, logs structured Resend acceptance metadata, and supports a secret-gated canary test mode for one configured test email. Added `scripts/test-reset-password-live.ts` so live reset-password verification can check the public route, token readback, and Resend `delivered` status without relying on local app runtime. See `DEPLOYMENT.md`.
- 2026-04-24: Forgot-password / reset link flow: removed the premature `applicants.is_active` short-circuit so an active Chronos user can still receive a reset email when applicant flags are stale; `sendEmail` now accepts `INVITE_FROM_EMAIL` as a fallback for `EMAIL_FROM` (legacy Vercel naming); reset links use the same `APP_URL` / `NEXTAUTH_URL` resolution as invite URLs; register UI explains cooldown when a token already exists; deploy workflow can read `/flolabs-chronos/INVITE_FROM_EMAIL` from SSM when `EMAIL_FROM` is absent.
- 2026-04-22: Phase 3 identity refactor: extended applicant-owned time-entry reads into daily summaries and user-delete ownership checks, so those flows now treat `time_entries.applicant_id` as canonical with `user_id` fallback. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: extended applicant-owned time-entry reads into member discussion entry lookup, so self-owned discussion visibility now follows `time_entries.applicant_id` first with `user_id` fallback. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: expanded applicant-owned time-entry reads into reports SSR plus `/api/entries` and `/api/reports` self-owner scopes, still falling back to `user_id` for non-backfilled rows and leaving admin/team-lead multi-user scopes on Chronos user ids for now. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: added `whereTimeEntriesForLinkedUser` so hot time-entry reads prefer `time_entries.applicant_id` with `user_id` fallback, and wired it into entry suggestions plus timer dashboard SSR week/recent/discussion-owner reads. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: added applicant FK columns on `entry_discussions` (starter + resolver) and `discussion_replies` (author), script `db:migrate:discussions-applicant-ids`, dual-write on discussion/reply/resolve APIs, `discussionStarterMatchesViewer` for starter scope, and timer `DiscussionCard` resolve UI aligned with Chronos vs applicant ids. See `notes/identity-refactor-phases.md`.
- 2026-04-22: Phase 3 identity refactor: added `tags.applicant_id` (nullable FK to `applicants`), backfill/migration script `db:migrate:tags-applicant-id`, dual-write on tag create, and `tag-applicant` helpers for list/ownership and entry+timer tag validation. See `notes/identity-refactor-phases.md`.
- 2026-04-21: Verified AWS Chronos transfer readiness. Live App Runner is running, AWS RDS holds 17,802 time entries across 106 projects, and CSV-to-RDS verification found only 12 missing unique source `Entry ID`s. Verification note saved at `notes/transfer-verification-2026-04-21.md`.
- 2026-04-21: Backfilled `user_email_aliases` from current `users.email` values in AWS so all migrated users can sign in with their current Chronos email and existing password. Note: legacy alternate emails beyond the current primary email still require a later authoritative alias backfill if needed.
- 2026-04-21: Changed the provisioning model so Hephaestus or HubSpot applicants should always get a Chronos `users` record as soon as they exist in the applicant pipeline. Chronos access is now intended to be controlled by applicant stage or status, instead of account creation timing. `Joined` or `Active` should enable access, while earlier statuses should keep the account present but disabled.
- 2026-04-21: Began phased Chronos identity refactor tracking in `notes/identity-refactor-phases.md`. Direct repo scan confirms the `users` table is still deeply referenced across auth, permissions, timer flows, reports, settings, scripts, and schema FKs.
- 2026-04-21: Phase 1 of the identity refactor is now complete. Dependency buckets are grouped into immediately-switchable canonical identity paths, compatibility paths, and hard schema blockers. The exact Phase 2 first cut is now defined: make applicants canonical in auth/session and recovery flows first, while keeping `users` only as a temporary ownership compatibility layer until FK-backed record migration.

- Added phase-1 duplicate-person detection contract for shared applicant data: Chronos/Hephaestus now surface likely duplicate accounts for HR review using strong signals first (phone, LinkedIn) and supporting profile overlap signals, without auto-merging records.
- Added phase-2 duplicate review persistence in Chronos with shared review statuses so hephaestus can consume maintained duplicate decisions instead of relying on local-only heuristics.

- Documentation: `ARCHITECTURE.md` design-system section now covers dual-theme tokens, modal overlay scrolling, `FlolabsMark`, and correct task-on-stop data rules; `CLAUDE.md` and this file document theme implementation details.

- Mobile dashboard navigation now exposes the FloLabs logo in the phone header and uses it to toggle a sidebar-style navigation panel, while keeping the desktop sidebar behavior intact.
- Users page tables now use tighter horizontal spacing and slightly smaller minimum widths so more columns stay visible on smaller screens without dropping content.
- MasterClass page creation/repair now uses the canonical title format `{full name}'s {MasterClass name}` from the MasterClasses index mapping while still reusing safe legacy matches to avoid duplicate pages.
- Reports page mobile layout was tightened so the main report content no longer depends on horizontal scrolling: summary stats now stack responsively, the breakdown table renders as stacked cards on small screens, the detailed-entry sort controls wrap cleanly, and report entry cards split their action/duration row for narrow widths while preserving all scoped report data.
- Live-state indicators that were still using the old sky-blue treatment were updated to the warm red live treatment on the Users page live badge, the active-timer card, and the mobile bottom timer pill.
- Users page now shows which visible users are currently live, along with the running duration of their active entry; the data comes from existing Redis-backed active timers and is refreshed from timer SSE events without expanding member visibility.
- On the Users page Live column, the Chronos project always uses the same **Project · {name}** line (folder icon + text) as when a Notion task is present, including when there is no task.
- Users page live timers now render linked Notion tasks as warm clickable badges that open the task page in a new tab, and the timer-entry form stack no longer introduces an inner scrollbar from `TimerControls` root overflow.
- Timer dashboard **Weekly Momentum** card sums completed entries whose `startedAt` falls in the **current calendar week** (Monday–Sunday, local time) and compares to the user’s full **weekly target hours**; refreshes use `/api/entries` with `from`/`to` for that range.
- `/register` onboarding/reset UI now includes reveal-password controls plus password confirmation for both invite acceptance and reset-password completion, while `/register?forgot=1` remains the request-reset form.
- Tooltip/info-dialog rendering was hardened so delayed tooltips stay within the visible viewport even inside overflow-constrained UI and mobile layouts.
- Timer UX updated end-to-end: timer suggestions now auto-start when idle and safely apply onto the running timer when one already exists.
- Timer start no longer requires any prefilled fields; `time_entries.project_id` was migrated to optional so empty-start timers persist correctly.
- Timer stop requires a selected project and non-empty description in UI and API; a task is required only when the project has `requiresTaskOnStop`, with matching disabled stop affordances and mobile messaging.
- Timer header now includes a round play/stop quick-action button beside the avatar; active timers show a disabled grey stop state until the stop requirements are satisfied.
- Removed the duplicate active-description display beneath the timer clock so the Description field is the authoritative inline source.
- Added migration script `scripts/migrate-timer-project-optional.ts` and ran it successfully.
- Added `scripts/migrate-invitations-notion-team-member-id.ts` and `pnpm db:migrate:invitations-notion` for environments where `invitations.notion_team_member_id` was never applied (without it, `POST /api/invitations` insert fails against the Drizzle schema).
- Invitation onboarding now routes Team Member page creation through shared Notion helpers instead of duplicating raw fetch logic in `src/app/api/invitations/route.ts`.
- Team Member creation now supports Notion's native page-template flow and falls back cleanly when templates are unavailable or misconfigured.
- New Team Member pages now also create a linked Onboarding page in `NOTION_ONBOARDINGS_DB_ID`, attempt to use that database's default template, and then patch the Team Member page's `Onboarding` relation.
- Invitation-created Team Member resolution is now duplicate-safe: exact normalized email match first, exact normalized name fallback second, and ambiguous matches stop the invitation before a duplicate page is created.
- Reused Team Member pages are now patched minimally for invite integrity instead of being replaced with fresh duplicates.
- Invitation-created/repaired Team Member flows now also create MasterClass pages in every relevant MasterClass database derived from the MasterClasses index, deduplicated per target database and using each target database's default template when possible.
- User weekly target-hour edits now update the linked Notion Team Member page's `Time Commitment` property immediately instead of waiting for a scheduled sync.
- Timer stop validation is now project-aware: project + description are always required, while tasks are required only for projects marked `requiresTaskOnStop`.
- Projects now expose a `requiresTaskOnStop` setting so cases like Program Task can enforce a task before stop.
- Notion DB configuration in the control panel now distinguishes Team Members DB vs Onboarding DB vs MasterClasses index DB instead of overloading a single Notion DB setting.
- Confirmed from current Notion developer docs: there is no documented API endpoint for inviting a guest to a page/workspace page, so Floffice guest access remains a manual Notion-admin step.
- Legacy loose scripts `scripts/tmp-app-config-init.js` and `scripts/tmp-app-config-seed.js` were checked for removal; they are not present in the current repo state.

## Known State

- Production deployed at https://athensgreecemarathon.com
- Database schema migrated (per-user tags, time_entry_tags join table, and optional `time_entries.project_id` for empty-start timers)
- Build passes: `pnpm exec tsc --noEmit` and `pnpm build` both green
- Current verification for the mobile-nav / Users-page / MasterClass-title update is green: `pnpm exec tsc --noEmit`, targeted `pnpm exec eslint ...`, and `pnpm build`
- Repo-wide `pnpm exec eslint .` still reports unrelated pre-existing issues in auth/control, tooltip, report-filter, timer-dashboard, and Discord-provisioning files outside this task
- Admin account: `pm@flolabsinnovations.com`

---

## ✅ Completed — Entry Discussions Feature

### Feature: Entry Discussions ✅

- `entry_discussions` table: `id`, `entry_id`, `started_by_id`, `message`, `resolved_at`, `resolved_by_id`, `created_at`, `updated_at`
- Migration: `scripts/migrate-entry-discussions.ts` (`pnpm run db:migrate:entry-discussions`)
- Permission helpers in `src/lib/permissions.ts`: `canStartDiscussion`, `canResolveDiscussion`, `canViewDiscussions`
- `discussionBroadcaster` EventEmitter in `src/lib/realtime.ts` + `broadcastDiscussionChange(entryId)`
- SSE route (`/api/sse`) now forwards `discussion:new` events to connected clients
- API routes:
  - `GET/POST /api/discussions` — list unresolved (scoped by role) / start discussion
  - `GET /api/discussions/entry/[entryId]` — all discussions on a specific entry (resolved + unresolved)
  - `PATCH/DELETE /api/discussions/[id]` — resolve or hard-delete
- `EntryCard`: chat bubble button visible only to admins/team leads on other users' entries
- `EntryList`: forwards `onDiscuss`, `viewerRole`, `viewerId` props to each `EntryCard`
- `ReportEntries`: modal to start a discussion from the Reports page (admin/team lead only)
- `DiscussionCard` (`src/components/discussions/DiscussionCard.tsx`): collapsible card on the timer dashboard showing unresolved discussions; re-fetches on SSE discussion events
- Timer dashboard (`TimerDashboardClient`): renders `DiscussionCard` above `ActiveTimerCard` in the right column
- Timer page (`/timer/page.tsx`): SSR-fetches initial discussions per role and passes them to client
- **Note:** Live-timer discussions intentionally skipped — active timers are Redis-only with no stable `entry_id` until stopped.

---

---

## ✅ Completed — Discussion Replies Feature

### Feature: Discussion Replies ✅

- `discussion_replies` table: `id`, `discussion_id`, `author_id`, `message`, `created_at`, `updated_at` — FK to `entry_discussions(id)` ON DELETE CASCADE
- Migration: `scripts/migrate-discussion-replies.ts` (`pnpm run db:migrate:discussion-replies`)
- `DiscussionReply` TypeScript interface in `src/types/index.ts`; `EntryDiscussion` updated with `replies?: DiscussionReply[]`
- API routes:
  - `GET /api/discussions/[id]/replies` — list replies for a discussion (auth + canViewDiscussions check)
  - `POST /api/discussions/[id]/replies` — add a reply (auth + canViewDiscussions; anyone who can see the discussion can reply)
  - `fetchRepliesForDiscussions` helper exported from the replies route, used by both discussions list routes
- `GET /api/discussions` and `GET /api/discussions/entry/[entryId]` now attach replies to each discussion
- `DiscussionCard` rewritten: per-discussion expand/collapse, full thread view (opening message + replies as chat bubble rows with colored initials avatar), inline reply textarea + Send button, optimistic reply append, Cmd/Ctrl+Enter shortcut; count badge toggles all-expanded/all-collapsed

---

## What's Next (V1.2 candidates)

- [ ] Email delivery for invitations (Resend integration)
- [ ] Password change in settings
- [ ] Team lead ability to invite members to their own team
- [x] Active timer visibility for team leads/admins on the Users page (Redis-backed state + SSE refresh)
- [ ] Mobile-optimized bottom nav improvements
- [ ] Audit log for admin actions

---

## Handoff

When continuing work:
1. Read `CLAUDE.md` for coding rules
2. Check this file for current status
3. Run `pnpm exec tsc --noEmit && pnpm build` to verify green state
4. Check `src/lib/db/schema.ts` matches the live database
5. If schema changed, write a migration script in `scripts/` and run it
6. After completing a feature, mark it ✅ here and update `ARCHITECTURE.md`
