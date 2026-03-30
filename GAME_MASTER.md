# GAME_MASTER.md — FloLabs Chronos Development Tracker

## Project Status
**Date:** 2026-03-28  
**Phase:** V1 role-and-team refactor in progress  
**Stack:** Next.js 16 + Drizzle + Neon Postgres + Redis + NextAuth v5

---

## Source Of Truth

- `ARCHITECTURE.md` defines the target V1 operating model
- `CLAUDE.md` defines the implementation guardrails for coding agents
- Code must be moved toward:
  - invite-only registration
  - three roles (`admin`, `team_lead`, `member`)
  - single primary team per user
  - admin-only project mutation
  - team-scoped reports and team visibility

---

## Completed Before This Refactor

- production deployment is live on Vercel
- timer provider/state consistency was fixed
- Redis pub/sub fan-out was repaired
- Notion sync was updated to handle the real Notion schema
- db/env fallbacks were aligned with the actual Vercel environment
- `pnpm build`, `pnpm lint`, and `pnpm exec tsc --noEmit` were passing

---

## Current Refactor Objectives

### 1. Schema and Auth Foundation
- [ ] Add `teams` table
- [ ] Add `invitations` table
- [ ] Extend `users` with `teamId` and `isActive`
- [ ] Expand roles to `admin | team_lead | member`
- [ ] Prevent inactive users from authenticating
- [ ] Add shared permission helpers for team-aware authorization

### 2. Invite-Only Onboarding
- [ ] Replace open self-registration with token-based registration
- [ ] Add invitation validation endpoint
- [ ] Add invitation creation endpoint
- [ ] Return shareable invite URLs even if email delivery is not configured
- [ ] Ensure invited emails cannot create duplicate accounts

### 3. Team Visibility
- [ ] Admins can see all teams and all members
- [ ] Team leads can see only members of their own team
- [ ] Members can see only their own team assignment
- [ ] Replace current global `/team` user list with role-scoped data

### 4. Project Permissions
- [ ] Keep project reads available for all authenticated users
- [ ] Restrict project create/edit/archive to admins in API
- [ ] Remove project management UI actions for non-admins

### 5. Report Permissions
- [ ] Admin sees all report data
- [ ] Team lead sees only their team's report data
- [ ] Member sees only their own report data
- [ ] Filter dropdowns must respect the same scope

---

## Suggested Execution Order

1. Schema changes
2. Shared permission layer
3. Auth/register changes
4. API authorization updates
5. Team page rewrite
6. Project UI permission cleanup
7. Verification and redeploy

---

### 6. UI Polish
- [x] Delayed tooltip component (`Tooltip`) for icon-only buttons — shows label after 3s hover
- [x] Applied to Projects page (edit, archive, unarchive)
- [x] Applied to Team page (edit member, delete member, disable/delete invite)
- [x] Applied to EntryCard (resume, edit, delete)

### 7. Admin Destructive Controls
- [x] Admin can disable invitation links
- [x] Admin can delete invitation links
- [x] Admin can delete team members when they have no time entries
- [x] Destructive actions use confirmation modals with Cancel as the highlighted button

### 8. Time Entry Management
- [x] Bulk operations API (`POST /api/entries/bulk`): delete or change project on multiple entries
- [x] Multi-select entries with checkboxes (visible on hover or when any entry selected)
- [x] Floating action bar for bulk delete and bulk project change
- [x] Individual entry edit supports project change (was already in place)
- [x] Delete confirmation modals use Cancel as highlighted button

### 9. Reports Search and Filtering
- [x] Debounced search input (2-second delay) — no more lag while typing
- [x] Search now matches across descriptions, project names, tag names, and user names (ILIKE)
- [x] Configurable page size: 25, 50, 100, 250, 500, or All entries per page

---

## Risks To Watch

- existing inline `admin` checks may accidentally allow or block team leads incorrectly
- deleting users is unsafe once time entries exist; prefer soft deactivation
- filter UIs can leak global visibility even when API data is scoped correctly
- proxy-only gating is insufficient; route handlers must re-check access

---

## Handoff

If OpenClaw continues tomorrow, start by checking:
- `src/lib/db/schema.ts`
- `src/lib/auth.ts`
- `src/lib/permissions.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/reports/route.ts`
- `src/app/(dashboard)/team/page.tsx`

The next agent should assume the documented architecture is now the target contract and continue implementation from the permission layer outward.
