# GAME_MASTER.md — FloLabs Chronos Development Tracker

## Project Status
**Date:** 2026-03-31
**Phase:** V1 feature-complete, in testing
**Stack:** Next.js 16 + Drizzle + Neon Postgres + Redis + NextAuth v5

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

---

## Known State

- Production is deployed on Vercel
- Database schema is migrated (per-user tags, time_entry_tags join table)
- Build passes: `pnpm exec tsc --noEmit` and `pnpm build` both green
- Admin account: `pm@flolabsinnovations.com`

---

## What's Next (V1.1 candidates)

- [ ] Email delivery for invitations (Resend integration)
- [ ] Password change in settings
- [ ] Team lead ability to invite members to their own team
- [ ] Notion sync updated for multi-tag entries
- [ ] Active timer visibility for team leads/admins
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
