# GAME_MASTER.md — FloLabs Chronos Development Tracker

## Project Status
**Date:** 2026-04-01
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

- `NOTION_ONBOARDINGS_DB_ID` added to `.env.local` and `.env.production.local`
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

## Known State

- Production deployed at https://athensgreecemarathon.com
- Database schema migrated (per-user tags, time_entry_tags join table)
- Build passes: `pnpm exec tsc --noEmit` and `pnpm build` both green
- Admin account: `pm@flolabsinnovations.com`

---

## What's Next (V1.2 candidates)

- [ ] Email delivery for invitations (Resend integration)
- [ ] Password change in settings
- [ ] Team lead ability to invite members to their own team
- [ ] Active timer visibility for team leads/admins (SSE broadcast)
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
