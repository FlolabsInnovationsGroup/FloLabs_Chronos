# CLAUDE.md — FloLabs Chronos

Project context for coding agents working on this repository.

## Read Order

1. `ARCHITECTURE.md` — source of truth for product model, data model, and access rules
2. `GAME_MASTER.md` — current implementation status, completed work, and next steps
3. Then inspect the actual code before changing behavior

## Workflow

- `ARCHITECTURE.md` is the **target contract**. If the code disagrees with it, fix the code.
- `GAME_MASTER.md` tracks **what's done and what's next**. Update it after completing work.
- `CLAUDE.md` (this file) defines **how to work** in this repo. Follow these guardrails.

When starting a session, check `GAME_MASTER.md` first for current status and handoff notes.

---

## What This App Is

FloLabs Chronos is an internal time-tracking and team-management application.

V1 priorities:
- reliable timer tracking
- team-scoped reporting
- admin-controlled project creation
- per-user tag management with multi-tag entries
- invite-only account onboarding
- clean editorial UI using Vellum Ink with custom dropdowns

This is not an open signup SaaS. Treat it as an internal operations tool with strict role boundaries.

---

## Current Product Contract

### Roles
- `admin`
- `team_lead`
- `member`

### Role Rules
- **Admins** can manage teams, invite users, create/edit/archive/delete projects, see all tags (with creator names), and see all reports.
- **Team leads** can see members and reports for their own team only.
- **Members** can see only their own reports and which team they belong to.
- **All users** can create, view, and delete their own tags.

### Team Rules
- Chronos supports **multiple teams per user** via `team_memberships`
- `users.teamId` remains the primary/default compatibility pointer
- non-admin users should always have at least one team membership
- admins may be global and have `teamId = null`

### Tag Rules
- Tags are **per-user** — unique per (name, userId), not globally unique.
- Tags have **no color and no icon** — plain labels only.
- Normal users see only their own tags.
- Admins see all tags on the Tags page with creator names.
- Time entries support **multiple tags** via the `time_entry_tags` join table.
- Deleting a tag removes associations but preserves time entries.
- Deleting a user cascades to their tags.

### Registration Rules
- registration is **invite-only** for first-time account creation
- `/register?invite=<token>` must require a valid invite token
- `/register?reset=<token>` is the password reset / first-time password reset surface
- forgot-password request mode lives at `/register?forgot=1`
- first-time password set and reset-password flows both support reveal-password UX and password confirmation
- invited users are assigned to all invited teams automatically, with the first mirrored into `users.teamId`
- if an email already exists in `users`, registration must fail

### Project Rules
- all authenticated users can read projects needed for timer entry
- only admins can create, edit, archive, delete, or restore projects
- deleting a project also deletes all linked time entries (with confirmation warning)

### Team Rules (Notion-Driven)
- teams are imported from Notion via `/api/cron/teams-sync` (every 15 min)
- `NOTION_TEAMS_DB_ID=9828e33b94e64dcba86f8b4ad7a21a23` — Teams DB
- manual "Create Team" UI is removed; admins manage teams in Notion
- invite form only shows active teams (`isActive = true`)

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
- **Deployment:** Vercel — project `flo-labs-chronos`, team `flomad-dev`

---

## Vercel API Access

A no-expiration Vercel personal access token is stored as `VERCEL_TOKEN` in both `.env.local` and `.env.production.local`. Use it for Vercel API calls (domain management, deployments, etc.):

- **Token env var:** `VERCEL_TOKEN`
- **Team ID:** `team_6Y3HFbsxBOKvTmB6Hft71t5G`
- **Project ID:** `prj_3MFDCbI5X7AEOozfYWvlNd5wwUL7`
- **Custom domain:** `athensgreecemarathon.com` — verified, DNS via Dynadot (`ns1.dyna-ns.net` / `ns2.dyna-ns.net`), A records pointing to Vercel IPs

---

## Architecture Notes To Preserve

### Timers
- timers are timestamps, not ticking counters
- active timers live in Redis
- completed entries live in Postgres
- clients compute elapsed time locally from `startedAt`
- active timer visibility on the Users page reuses the Redis-backed timer state plus SSE refreshes; admins see all live users and team leads see only users within their accessible scope

### Authorization
- never trust `proxy.ts` alone
- every route handler must enforce role and team scope itself
- centralize access logic in shared helpers (`src/lib/permissions.ts`)

### Database Tables
- `users`, `teams`, `invitations`, `projects`, `tags`, `time_entries`, `time_entry_tags`

### Tags Architecture
- `tags.user_id` is NOT NULL, references `users(id) ON DELETE CASCADE`
- `time_entry_tags` is the join table between entries and tags (both FKs cascade on delete)
- There is NO `tag_id` column on `time_entries` — always use the join table

---

## Coding Rules For This Repo

### Prefer shared permission helpers

Use `src/lib/permissions.ts` for all access control. Avoid scattered inline role checks.

### Keep V1 simple

Do not introduce multi-team membership unless explicitly requested.

### Avoid destructive user deletion

If a person already has time entries, preserve historical integrity. Block deletion and suggest deactivation.

### Registration must not drift back to open signup

Any work on auth or onboarding must preserve invite-only registration.

### UI must reflect permissions

- hide project creation controls from non-admins
- hide invite and team-management controls from non-admins
- destructive actions must use a confirmation modal with **Cancel visually highlighted** (primary variant) and the destructive action as danger variant
- never show global user filters to team leads or members

### Use custom dropdowns, not native selects

All dropdown menus must use `DropdownSelect` or `Select` (which wraps `DropdownSelect`) instead of native `<select>` elements. This ensures Vellum Ink styling consistency across all browsers and mobile devices.

### Use TagMultiSelect for tag pickers

Tag selection must use `TagMultiSelect` component. It supports multi-select and inline creation of new tags.

### Modals must fit the screen

All modals use `max-h-[calc(100vh-2rem)]` with scrollable body content. The Modal component handles this automatically.

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

### Add a dropdown/select
1. use `DropdownSelect` or `Select` component — never native `<select>`
2. for tags, use `TagMultiSelect`

### Add an icon-only button
1. wrap in `<Tooltip label="Action Name">`
2. remove any `title` attribute

### Add a destructive action
1. use confirmation modal
2. Cancel = `variant="primary"` (highlighted)
3. Destructive action = `variant="danger"`

### Modify the schema
1. update `src/lib/db/schema.ts`
2. update shared TypeScript types in `src/types/index.ts`
3. write a migration script in `scripts/` if needed
4. run `pnpm db:push` (use PTY mode for interactive prompts)
5. update seed data if the change affects bootstrapping
6. update `ARCHITECTURE.md` data model section

---

## Handoff Notes

When continuing work, check these first:
- `GAME_MASTER.md` for current status
- whether the database schema matches `src/lib/db/schema.ts`
- whether the build passes: `pnpm exec tsc --noEmit && pnpm build`

If the docs and code disagree, follow `ARCHITECTURE.md` and update the code to match.
