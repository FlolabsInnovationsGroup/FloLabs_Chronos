# CLAUDE.md — FloLabs Chronos

Project context for coding agents working on this repository.

## Read Order

1. `ARCHITECTURE.md` — source of truth for product model, data model, and access rules
2. `GAME_MASTER.md` — current implementation status and next steps
3. Then inspect the actual code before changing behavior

---

## What This App Is

FloLabs Chronos is an internal time-tracking and team-management application.

V1 priorities:
- reliable timer tracking
- team-scoped reporting
- admin-controlled project creation
- invite-only account onboarding
- clean editorial UI using Vellum Ink

This is not an open signup SaaS. Treat it as an internal operations tool with strict role boundaries.

---

## Current Product Contract

### Roles
- `admin`
- `team_lead`
- `member`

### Role Rules
- **Admins** can manage teams, invite users, create/edit/archive projects, and see all reports.
- **Team leads** can see members and reports for their own team only.
- **Members** can see only their own reports and which team they belong to.

### Team Rules
- V1 uses **one primary team per user**
- non-admin users should always have a `teamId`
- admins may be global and have `teamId = null`

### Registration Rules
- registration is **invite-only**
- `/register` must require a valid invite token
- invited users are assigned to the invite's team automatically
- if an email already exists in `users`, registration must fail
- do not recreate accounts for invited emails

### Project Rules
- all authenticated users can read projects needed for timer entry
- only admins can create, edit, archive, or restore projects

---

## Stack

- **Framework:** Next.js 16 App Router
- **Language:** TypeScript
- **ORM:** Drizzle ORM
- **Database:** Neon Postgres
- **Auth:** NextAuth v5 credentials
- **Realtime:** Redis + SSE
- **Validation:** Zod
- **Styling:** Tailwind CSS with Vellum Ink tokens
- **Deployment:** Vercel

---

## Architecture Notes To Preserve

### Timers
- timers are timestamps, not ticking counters
- active timers live in Redis
- completed entries live in Postgres
- clients compute elapsed time locally from `startedAt`

### Authorization
- never trust `proxy.ts` alone
- every route handler must enforce role and team scope itself
- centralize access logic in shared helpers instead of duplicating inline checks everywhere

### Database Direction

Expected core tables:
- `users`
- `teams`
- `invitations`
- `projects`
- `tags`
- `time_entries`

Expected high-value user fields:
- `role`
- `teamId`
- `isActive`

### Invitation Delivery

The invitation system should be implemented in two layers:
1. creation and token persistence
2. delivery abstraction

If no email provider is configured, the API should still return a shareable invite URL. Do not block the feature on SMTP or vendor setup.

---

## Coding Rules For This Repo

### Prefer shared permission helpers

If you add or change access control, do it through a shared server-side utility layer. Avoid scattered one-off `session.user.role === "admin"` checks when the logic is actually team-aware.

### Keep V1 simple

Do not introduce multi-team membership yet unless the task explicitly requires it. Single-team-per-user is the intended V1 simplification.

### Avoid destructive user deletion

If a person already has time entries, preserve historical integrity. Prefer soft deactivation (`isActive = false`) over deleting rows.

### Registration must not drift back to open signup

Any work on auth or onboarding must preserve invite-only registration unless the product contract changes explicitly.

### UI must reflect permissions

Do not only block forbidden writes in the API. Also remove or disable the corresponding UI affordances:
- hide project creation controls from non-admins
- hide invite and team-management controls from non-admins
- never show global user filters to team leads or members

---

## Common Tasks

### Add or change a protected route
1. inspect the current route handler
2. reuse shared auth/permission helpers
3. validate input with Zod
4. enforce both role and team scope

### Add or change a dashboard page
1. prefer server components for initial data loading
2. push interactivity into small client components
3. keep Vellum Ink styling intact
4. remove actions the current role cannot perform

### Modify the schema
1. update `src/lib/db/schema.ts`
2. update shared TypeScript types if needed
3. run `pnpm db:push`
4. update seed data if the change affects bootstrapping

---

## OpenClaw Handoff Notes

When continuing work, check these first:
- whether teams/invitations schema has already been pushed
- whether registration is already token-gated
- whether reports are team-scoped in both the page and the API
- whether project mutations are admin-only in both API and UI
- whether the team page renders different data by role

If the docs and code disagree, follow `ARCHITECTURE.md` and update the code to match.
