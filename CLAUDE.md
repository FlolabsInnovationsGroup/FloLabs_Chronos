# CLAUDE.md — FloLabs Chronos

Project context for coding agents working on this repository.

## Read Order

1. `ARCHITECTURE.md` — start with **“System architecture (for agents)”**, then the product/data contract (roles, identity, timers, Notion, etc.)
2. `DEPLOYMENT.md` — how production gets to AWS (GitHub Actions, SSM, App Runner)
3. `GAME_MASTER.md` — current implementation status, completed work, and next steps
4. This `CLAUDE.md` handoff section, especially “Current Mission” and “Access / Credentials Context”
5. Then inspect the actual code before changing behavior

## Workflow

- `ARCHITECTURE.md` is the **target contract**. If the code disagrees with it, fix the code.
- `GAME_MASTER.md` tracks **what's done and what's next**. Update it after completing work.
- `CLAUDE.md` (this file) defines **how to work** in this repo. Follow these guardrails.
- **Default: push after work.** When you finish a coherent change (code, docs, or both), commit with a clear message and **`git push`** to `origin` so the remote stays current. Skip pushing only if the user explicitly asks you not to, or if there is nothing to commit.
- **Absolute testing/deploy rule:** never, under any circumstance, test Chronos behavior on the local machine or create/use a local test environment as a substitute for production validation. Do not rely on host-local Docker, browser checks, local app runs, or local smoke tests for confidence. Test and validate only from AWS/deployed surfaces (App Runner, Lambda, EventBridge, CloudWatch, public deployment URLs, and other AWS-reachable paths), no matter the inconvenience or implications.

When starting a session, check `GAME_MASTER.md` first for current status and handoff notes.

---

## Production URLs

| | URL |
|---|---|
| **Production domain** | `https://athensgreecemarathon.com` |
| **AWS App Runner URL** | `https://hcmsmnfq5q.us-east-1.awsapprunner.com` |
| **Health check** | `GET https://hcmsmnfq5q.us-east-1.awsapprunner.com/api/health` |

## Non-Negotiable Validation Rule

For Chronos, do not test features locally. Do not spin up or rely on a local test environment "just to check quickly." Do not use host-local Docker success, local HTTP checks, or local browser/UI smoke tests as evidence that a change works. If a task requires validation, perform it only through AWS/deployed surfaces such as App Runner, Lambda, EventBridge, CloudWatch, public deployment URLs, or other AWS-reachable interfaces. If AWS-only validation is temporarily impossible, report the blocker instead of falling back to local testing.

---

## Access / Credentials Context

Future sessions should know where access currently comes from and how to continue without re-discovering everything.

### Repo locations
- Chronos app repo: `C:\Users\olire\Documents\workspace_python\FloLabs_Chronos`
- Hermes ops repo: `C:\Users\olire\Documents\workspace_python\FloLabs_Hermes`
- Hephaestus repo: `C:\Users\olire\Documents\workspace_python\hephaestus-international`

### Environment / secret sources
- `.env.local` and `.env.production.local` in the Chronos repo contain runtime values used by deploy tooling
- these files include AWS runtime values and also historically contained Neon values
- do not commit secrets
- use the existing env files for operational continuity, but prefer AWS-backed values for runtime/deploy decisions
- never treat local env-backed execution on this machine as an acceptable Chronos test environment

### AWS access context
- AWS CLI is pre-authenticated in this environment
- App Runner service: `flolabs-chronos`
- Service ARN: `arn:aws:apprunner:us-east-1:975049954782:service/flolabs-chronos/b6416d84200e4c5a9d884f8f4c134aaf`
- AWS URL: `https://hcmsmnfq5q.us-east-1.awsapprunner.com`
- Production domain: `https://athensgreecemarathon.com`
- RDS + Redis details available in `deploy/aws/provision-output.json` and local env files
- Preferred deploy path: GitHub Actions → AWS OIDC → ECR → App Runner on push to `main`; see `.github/workflows/deploy-aws-apprunner.yml`
- Bootstrap: `deploy/aws/setup-github-actions-deploy.ps1` creates the OIDC provider/role and seeds GitHub Actions secrets from provision output + local env files

### Vercel access context (legacy / DNS only)
Production hosting is **AWS App Runner**, not Vercel. A Vercel token may still exist in local env files for occasional API or domain management use only.
- Team ID: `team_6Y3HFbsxBOKvTmB6Hft71t5G`
- Project ID: `prj_3MFDCbI5X7AEOozfYWvlNd5wwUL7`
- Custom domain `athensgreecemarathon.com` — DNS should point to App Runner; do not assume records still target Vercel.

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
- **Team leads** can see members and reports for the **union of all teams** they belong to (`team_memberships`), not a single team only.
- **Members** can see only their own reports and their team assignment(s).
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
- **Database:** PostgreSQL — **production: AWS RDS**; local/dev uses `.env` `DATABASE_URL` (any Postgres)
- **Auth:** NextAuth v5 credentials (applicant-canonical session; see `ARCHITECTURE.md`)
- **Realtime:** Redis + SSE — **production: AWS ElastiCache** (`KV_URL` / `FL_KV_REDIS_URL`)
- **Validation:** Zod
- **Styling:** Tailwind CSS with Vellum Ink tokens; light/dark via CSS variables (`--c-*` on `:root` and `html.dark`)
- **Deployment (production):** **AWS App Runner** + **ECR** + **GitHub Actions** — see `DEPLOYMENT.md`

---

## Dark theme (implementation contract)

Chronos uses **one component tree** and **two palettes** defined in `src/app/globals.css`.

### How the active theme is chosen

1. **`ThemeScript`** (`src/components/theme/ThemeScript.tsx`) runs with Next.js `Script` **`strategy="beforeInteractive"`** so it executes before hydration.
2. It reads **`localStorage`** key **`chronos-theme`**. Values: **`"light"`**, **`"dark"`**, or **`"system"`** (match OS).
3. If the key is missing or any other value, behavior matches **system** (uses **`window.matchMedia("(prefers-color-scheme: dark)")`**).
4. It adds **`class="dark"`** on **`<html>`** when dark should apply, otherwise removes it. This prevents a light flash when the user prefers or saved dark mode.

### CSS and Tailwind wiring

- **Light tokens** live under **`:root`**; **dark tokens** override under **`html.dark`** (same variable names, different hex values). Primary example: light `#366769`, dark `#8ecbce`.
- **`@theme inline`** maps Tailwind color names to **`var(--c-*)`**, so utilities like **`bg-background`**, **`text-on-background`**, **`bg-surface-container-low`**, **`border-surface-container-highest`**, **`text-primary`**, **`bg-error`**, etc. switch with the theme.
- **`@custom-variant dark`** is defined as **`&:where(html.dark, html.dark *)`** so **`dark:`** utilities apply whenever `html` has the `dark` class (not the OS `prefers-color-scheme` alone).
- **`body`** sets **`background-color`** and **`color`** from **`var(--c-background)`** / **`var(--c-on-background)`**. Editorial extras (`--c-paper-shadow`, `--c-overlay-scrim`, `--c-warm-*`, focus rings) also have light/dark values.

### User controls

- **`ChronosThemeProvider`** (`src/components/theme/ChronosThemeProvider.tsx`): wraps the app in **`layout.tsx`**; keeps **`html.dark`**, **`localStorage`**, and **`prefers-color-scheme`** in sync when mode is **system**.
- **`ThemeToggle`** (`src/components/theme/ThemeToggle.tsx`): **`DropdownSelect`** for Light / Dark / System in **`TopBar`** (tooltip shows effective appearance when using System).
- **Settings → Appearance** (`SettingsForm.tsx`): same three-way **`Select`**.

### Brand and assets

- In-app chrome logo: **`FlolabsMark`** (`src/components/brand/FlolabsMark.tsx`) uses **`fill="var(--c-primary)"`** so the mark always matches semantic primary.
- **`/public/flchron-logo.svg`** used on auth pages via **`<Image>`** keeps fixed colors inside the SVG; it does **not** inherit `--c-*` unless inlined or changed.

### Authoring rules for agents

- Prefer **semantic Tailwind classes** or **`var(--c-*)`** in inline styles; avoid new **hard-coded hex** utilities that ignore dark mode.
- Use **`dark:`** only when light and dark must **diverge outside** the shared token set (should be rare).
- Optional maintenance: **`node scripts/apply-semantic-theme-classes.mjs`** helps migrate pasted hex classes toward semantic tokens.

---

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

Multi-team membership via **`team_memberships`** is already in scope. Do not introduce new membership or permission dimensions (e.g. extra org layers, ad-hoc sharing rules) unless explicitly requested.

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

The shared **`Modal`** (`src/components/ui/Modal.tsx`) uses a **fixed full-viewport overlay** with **`overflow-y-auto`** on the **outer** wrapper so tall dialogs scroll with the page, not inside a clipped inner body. Keep new modal content compatible with that pattern (avoid nested `overflow-hidden` that traps focus or scroll).

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
- whether your branch is pushed (`git status` / `git log origin/main..HEAD`)

If the docs and code disagree, follow `ARCHITECTURE.md` and update the code to match.
