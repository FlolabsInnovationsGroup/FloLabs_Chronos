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
- [x] Invitation flow now reuses existing Team Member pages by exact normalized email first, then exact normalized name, instead of blindly creating duplicates when older Notion records are missing email
- [x] Invitation flow now blocks ambiguous Team Member matches with a clear 409 error so the team can resolve Notion manually before retrying
- [x] Reused Team Member pages now receive minimal safe repairs (missing email, missing invited-team relations, missing onboarding relation) instead of creating a duplicate page
- [x] Confirmed limitation: Notion's public API does not expose a documented guest-invite/share-page endpoint, so Chronos cannot automate Floffice guest invites

### Team Visibility ✅
- [x] Admins see all teams and members
- [x] Team leads see only their own team
- [x] Members see only their team assignment
- [x] Team page renders different data by role

### Project Permissions ✅
- [x] All users can read projects
- [x] Create/edit/archive/delete restricted to admins in API and UI
- [x] Visual icon picker with searchable Material icons
- [x] Project deletion deletes linked time entries (with confirmation warning)

### Report Permissions ✅
- [x] Admin sees all report data
- [x] Team lead sees team data only
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
- `src/lib/notion.ts` — added `buildTeamMemberIndex`, `resolveTeamMemberPageId`, `buildNotionEntryProperties`, `syncEntryToNotionFull`, `markEntryDeleted`, `queryNotionEntriesWindow`
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

**Status:** 🔲 Not started

---

## Recent Updates

- Mobile dashboard navigation now exposes the FloLabs logo in the phone header and uses it to toggle a sidebar-style navigation panel, while keeping the desktop sidebar behavior intact.
- Users page tables now use tighter horizontal spacing and slightly smaller minimum widths so more columns stay visible on smaller screens without dropping content.
- MasterClass page creation/repair now uses the canonical title format `{full name}'s {MasterClass name}` from the MasterClasses index mapping while still reusing safe legacy matches to avoid duplicate pages.
- Reports page mobile layout was tightened so the main report content no longer depends on horizontal scrolling: summary stats now stack responsively, the breakdown table renders as stacked cards on small screens, the detailed-entry sort controls wrap cleanly, and report entry cards split their action/duration row for narrow widths while preserving all scoped report data.
- Live-state indicators that were still using the old sky-blue treatment were updated to the warm red live treatment on the Users page live badge, the active-timer card, and the mobile bottom timer pill.
- Users page now shows which visible users are currently live, along with the running duration of their active entry; the data comes from existing Redis-backed active timers and is refreshed from timer SSE events without expanding member visibility.
- `/register` onboarding/reset UI now includes reveal-password controls plus password confirmation for both invite acceptance and reset-password completion, while `/register?forgot=1` remains the request-reset form.
- Tooltip/info-dialog rendering was hardened so delayed tooltips stay within the visible viewport even inside overflow-constrained UI and mobile layouts.
- Timer UX updated end-to-end: timer suggestions now auto-start when idle and safely apply onto the running timer when one already exists.
- Timer start no longer requires any prefilled fields; `time_entries.project_id` was migrated to optional so empty-start timers persist correctly.
- Timer stop now requires both a description and a selected task in both UI and API, with disabled stop affordances and explicit mobile messaging when the requirements are missing.
- Timer header now includes a round play/stop quick-action button beside the avatar; active timers show a disabled grey stop state until the stop requirements are satisfied.
- Removed the duplicate active-description display beneath the timer clock so the Description field is the authoritative inline source.
- Added migration script `scripts/migrate-timer-project-optional.ts` and ran it successfully.
- Invitation onboarding now routes Team Member page creation through shared Notion helpers instead of duplicating raw fetch logic in `src/app/api/invitations/route.ts`.
- Team Member creation now supports Notion's native page-template flow and falls back cleanly when templates are unavailable or misconfigured.
- New Team Member pages now also create a linked Onboarding page in `NOTION_ONBOARDINGS_DB_ID`, attempt to use that database's default template, and then patch the Team Member page's `Onboarding` relation.
- Invitation-created Team Member resolution is now duplicate-safe: exact normalized email match first, exact normalized name fallback second, and ambiguous matches stop the invitation before a duplicate page is created.
- Reused Team Member pages are now patched minimally for invite integrity instead of being replaced with fresh duplicates.
- Invitation-created/repaired Team Member flows now also create MasterClass pages in every relevant MasterClass database derived from the MasterClasses index, deduplicated per target database and using each target database's default template when possible.
- User weekly target-hour edits now update the linked Notion Team Member page's `Time Commitment` property immediately instead of waiting for a scheduled sync.
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
