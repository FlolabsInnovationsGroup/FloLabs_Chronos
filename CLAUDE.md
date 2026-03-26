# CLAUDE.md — FloLabs Chronos

Project context for AI coding agents working on this codebase.

## What Is This?

FloLabs Chronos is a team time-tracking web app replacing Toggl. Built for FloLabs' internal use with plans to scale across the full team.

**Read `ARCHITECTURE.md` first** — it has the full technical plan, data model, and design decisions.

---

## Quick Start

```bash
pnpm install
cp .env.example .env.local   # Fill in database + Redis + auth credentials
pnpm db:generate              # Generate Drizzle migrations
pnpm db:push                  # Push schema to database
pnpm dev                      # Start dev server on localhost:3000
```

### Required Services

| Service | Purpose | Dev Option |
|---|---|---|
| PostgreSQL | Primary database | Neon free tier or local Docker |
| Redis | Active timer state | Vercel KV or local Redis |
| Notion API | Backup sync (optional) | Skip for local dev |

---

## Tech Stack

- **Framework:** Next.js 15 (App Router, Server Components)
- **Language:** TypeScript (strict)
- **ORM:** Drizzle ORM with PostgreSQL
- **Auth:** NextAuth v5 (credentials provider, admin/member roles)
- **Real-time:** Vercel KV (Redis) + Server-Sent Events (SSE)
- **Styling:** Tailwind CSS with Vellum Ink design tokens
- **Validation:** Zod
- **Deployment:** Vercel + Vercel Postgres + Vercel KV

---

## Design System: Vellum Ink

**This is critical. The UI has a specific editorial aesthetic. Do not use generic component library styles.**

### Rules

1. **Background:** `#fbf9f5` (cream paper) — never white (`#fff`) as page background
2. **Text:** `#31332f` (ink) — **never pure `#000`**
3. **No borders for sectioning:** Use background color shifts between `surface`, `surface-container-low`, `surface-container`, `surface-container-high`
4. **Paper shadows only:** `box-shadow: 0 12px 32px -4px rgba(49, 51, 47, 0.06)` — no standard drop shadows
5. **Typography:** Newsreader (serif, italic) for headlines + numbers. Work Sans for body/UI text.
6. **Corners:** `rounded-sm` to `rounded-xl` — never `rounded-full` on buttons (only icon-only buttons)
7. **Colors:** Primary `#366769`, Secondary `#5c5e6e`, Tertiary `#755a40`

### Reference

- `stitch/vellum_ink/DESIGN.md` — Full design spec
- `stitch/timer_dashboard_desktop_paper_style/code.html` — Desktop layout reference
- `stitch/timer_dashboard_mobile_paper_style/code.html` — Mobile layout reference

Tailwind config has all color tokens defined. Use semantic names like `bg-surface`, `text-on-surface`, `bg-primary`, etc.

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/              # Login + register pages
│   ├── (dashboard)/         # Protected dashboard pages
│   │   ├── timer/           # Main timer view
│   │   ├── projects/        # Project CRUD
│   │   ├── team/            # User management (admin)
│   │   └── reports/         # Detailed reports + filters
│   └── api/
│       ├── auth/            # NextAuth route handler
│       ├── timer/           # start, stop, active
│       ├── entries/         # Time entry CRUD
│       ├── projects/        # Project CRUD
│       ├── tags/            # Tag CRUD
│       ├── users/           # Admin user management
│       ├── sse/             # Server-Sent Events for live timers
│       └── cron/            # Vercel Cron handlers
│           ├── notion-sync/ # Batch sync entries → Notion (every 5 min)
│           └── daily-summary/ # Discord daily summaries (daily 18:00)
├── components/
│   ├── ui/                  # Design system primitives (Button, Input, Card, etc.)
│   ├── layout/              # Sidebar, TopBar, BottomNav
│   ├── timer/               # TimerDisplay, TimerControls
│   ├── entries/             # EntryCard, EntryList
│   └── reports/             # ReportFilters, ReportTable
├── hooks/
│   ├── use-timer.ts         # Timer state + local tick from startedAt
│   └── use-sse.ts           # SSE subscription hook
├── lib/
│   ├── db/                  # Drizzle schema + connection
│   ├── auth.ts              # NextAuth config
│   ├── redis.ts             # Vercel KV client
│   ├── notion.ts            # Notion API sync client
│   ├── discord.ts           # Discord webhook helper
│   └── utils.ts             # Shared utilities
└── types/
    └── index.ts             # Shared TypeScript types
```

---

## Key Architecture Decisions

### Timers Are Timestamps, Not Ticks

Active timers store a `startedAt` ISO timestamp in Redis. Clients calculate elapsed time locally with `Date.now() - startedAt`. No server-side ticking. This scales to thousands of concurrent timers with zero compute cost.

### Redis for Hot, PostgreSQL for Cold

- **Redis (Vercel KV):** Active running timers. Key pattern: `timer:{userId}`. Ephemeral.
- **PostgreSQL:** Completed time entries. Durable, indexed, queryable for reports.
- On timer stop: data moves from Redis → PostgreSQL.

### SSE for Real-Time Updates

Timer start/stop events publish to a Redis channel. The SSE endpoint (`/api/sse`) subscribes and fans out to connected clients. One event per start/stop — no periodic polling.

### Notion Is a Backup, Not the Source of Truth

A Vercel Cron job syncs entries to Notion every 5 minutes. If Notion is down, entries queue in PostgreSQL and sync on the next run. The `notion_page_id` and `synced_at` columns on `time_entries` track sync state.

### Discord Is Fire-and-Forget

Webhook notifications fire inline in timer API routes. Failures are silently caught — they should never block the timer response. Per-user webhook URLs are managed by admins.

---

## Database Schema

Defined in `src/lib/db/schema.ts` using Drizzle ORM.

### Tables
- **users** — id, email, name, password (bcrypt), role (admin/member), discord_webhook_url, notify_on_start, notify_on_stop, daily_summary
- **projects** — id, name, color, icon, archived
- **tags** — id, name, color
- **time_entries** — id, user_id, project_id, tag_id, description, started_at, stopped_at, duration_ms, notion_page_id, synced_at, updated_at, created_at

### Key Indexes
- `idx_entries_user` — (user_id, started_at DESC) for user history
- `idx_entries_project` — (project_id, started_at DESC) for project reports
- `idx_entries_date` — (started_at DESC) for date-range queries
- `idx_entries_running` — partial index on stopped_at IS NULL
- `idx_entries_tag` — (tag_id) for tag filtering

---

## Auth & Roles

- **admin:** Full access — manage users, view all timers, access all reports, configure Discord webhooks
- **member:** Own timer, own entries, own reports

Protected via NextAuth middleware in `src/middleware.ts`. Admin-only routes check `session.user.role === 'admin'`.

---

## Integrations

### Notion Backup
- Cron: `*/5 * * * *` via Vercel Cron
- Syncs entries where `synced_at IS NULL OR synced_at < updated_at`
- Creates/updates pages in a Notion database
- Env: `NOTION_API_KEY`, `NOTION_DATABASE_ID`

### Discord Webhooks
- Per-user webhook URL stored in `users` table
- Fires on timer start (if `notify_on_start`) and stop (if `notify_on_stop`)
- Daily summary cron at 17:00 UTC for users with `daily_summary = true`
- Rich embeds with Chronos branding (color `#366769`)

---

## Deployment

- **Vercel:** Auto-deploy from Git. Vercel Postgres + Vercel KV provisioned in dashboard.
- **Crons:** Defined in `vercel.json` — notion-sync (5 min) and daily-summary (daily).
- **Domain:** Custom domain connected via Vercel DNS.

---

## Common Tasks

### Add a new API route
1. Create `src/app/api/<name>/route.ts`
2. Use `getServerSession()` from `src/lib/auth.ts` for auth
3. Validate input with Zod
4. Use Drizzle for DB queries

### Add a new dashboard page
1. Create `src/app/(dashboard)/<name>/page.tsx`
2. Follow Vellum Ink design system (check stitch/ for reference)
3. Use server components for data fetching, client components for interactivity

### Modify the database schema
1. Edit `src/lib/db/schema.ts`
2. Run `pnpm db:generate` to create migration
3. Run `pnpm db:push` to apply

---

## What's Left to Build (as of 2026-03-27)

- [ ] Complete component implementations (some component dirs may be empty)
- [ ] Discord webhook fields in admin user management UI
- [ ] Notion sync cron route (`src/app/api/cron/notion-sync/route.ts`)
- [ ] Daily summary cron route (`src/app/api/cron/daily-summary/route.ts`)
- [ ] `src/lib/notion.ts` — Notion API client
- [ ] `src/lib/discord.ts` — Discord webhook helper
- [ ] Add `notion_page_id`, `synced_at`, `updated_at` columns to time_entries schema
- [ ] Add `discord_webhook_url`, `notify_on_start`, `notify_on_stop`, `daily_summary` columns to users schema
- [ ] `vercel.json` with cron configuration
- [ ] Seed script for default admin user + sample data
- [ ] CSV export on reports page
- [ ] Test the full auth flow (login → dashboard → timer → stop → entry saved)
- [ ] Vercel deployment + env vars setup
- [ ] Connect custom domain

Check each file before assuming it's incomplete — the build agent may have finished some of these.
