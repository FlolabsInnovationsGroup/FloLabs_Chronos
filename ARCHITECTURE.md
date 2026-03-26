# FloLabs Chronos — Architecture

## Overview

Chronos is a team time-tracking tool built as a replacement for Toggl. It provides individual user accounts managed by admins, live timers visible across devices and the admin dashboard, detailed reports with flexible filtering, and a refined editorial UI ("Vellum Ink" design system).

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend + API | **Next.js 15** (App Router) on **Vercel** | SSR, edge caching, zero-config deploys |
| Auth | **NextAuth.js v5** (Auth.js) | Role-based (admin/member), credentials provider |
| Database | **PostgreSQL** (Neon Serverless or Vercel Postgres) | Complex queries, aggregations, serverless-friendly |
| ORM | **Drizzle ORM** | Type-safe, lightweight, great migrations |
| Real-time | **Vercel KV (Redis)** + **Server-Sent Events (SSE)** | Active timer state in Redis, SSE for live updates |
| Styling | **Tailwind CSS** with Vellum Ink design tokens | Matches Stitch AI designs exactly |
| Validation | **Zod** | Shared schemas between client and server |
| Domain | Custom domain via Vercel | Team-wide access |

### Why SSE over WebSocket?

For this use case, **Server-Sent Events (SSE)** are simpler and sufficient:
- Timers are **write-rare, read-frequent** — users start/stop occasionally, dashboard reads constantly
- SSE works over standard HTTP (no special infrastructure like API Gateway WebSocket)
- Vercel Edge Functions support SSE natively
- Falls back gracefully; no connection registry needed
- For thousands of concurrent viewers, a Redis pub/sub + SSE fan-out is lightweight

If we later need bidirectional real-time (e.g., collaborative editing), we can add WebSocket via a small AWS API Gateway layer.

---

## How Live Timers Work

**Timers are timestamps, not ticks.** This is the key insight.

### Start Timer
1. User clicks "Start" → API writes to **Redis**: `timer:{userId}` = `{ projectId, tag, description, startedAt }`
2. Also writes a `running` row in PostgreSQL (crash recovery)
3. Redis `PUBLISH` on `timers:updates` channel
4. SSE endpoint picks up the publish → fans out to all connected clients

### Display Timer (Any Device)
- Client connects to SSE endpoint, receives `startedAt` timestamp
- **Client counts up locally** using `Date.now() - startedAt`
- No per-second server messages. One event on start, one on stop.

### Stop Timer
1. API calculates `duration = now - startedAt`
2. Writes completed entry to PostgreSQL (with `stoppedAt` and `durationMs`)
3. Removes from Redis
4. Publishes stop event → SSE broadcast

### Admin Dashboard
- On load: fetch all active timers from Redis (one call)
- Subscribe to SSE for real-time adds/stops
- Each timer card ticks locally from `startedAt`
- **Thousands of timers, zero server ticking cost**

---

## Data Model

```sql
-- Users & auth
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  password    TEXT NOT NULL,  -- bcrypt hash
  role        TEXT NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Projects
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#366769',
  icon        TEXT DEFAULT 'folder',
  archived    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Tags
CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  color       TEXT DEFAULT '#755a40'
);

-- Time entries (the big table)
CREATE TABLE time_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  project_id  UUID NOT NULL REFERENCES projects(id),
  tag_id      UUID REFERENCES tags(id),
  description TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL,
  stopped_at  TIMESTAMPTZ,          -- NULL = still running
  duration_ms BIGINT,               -- computed on stop
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_entries_user     ON time_entries(user_id, started_at DESC);
CREATE INDEX idx_entries_project  ON time_entries(project_id, started_at DESC);
CREATE INDEX idx_entries_date     ON time_entries(started_at DESC);
CREATE INDEX idx_entries_running  ON time_entries(stopped_at) WHERE stopped_at IS NULL;
CREATE INDEX idx_entries_tag      ON time_entries(tag_id) WHERE tag_id IS NOT NULL;
```

---

## Project Structure

```
FloLabs_Chronos/
├── ARCHITECTURE.md          # This file
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout with fonts + providers
│   │   ├── page.tsx         # Landing / redirect
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx   # Sidebar + top bar
│   │   │   ├── timer/page.tsx       # Active timer + recent entries
│   │   │   ├── projects/page.tsx    # Project management
│   │   │   ├── team/page.tsx        # Team member list
│   │   │   └── reports/page.tsx     # Detailed reports (admin)
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── timer/
│   │       │   ├── start/route.ts
│   │       │   ├── stop/route.ts
│   │       │   └── active/route.ts
│   │       ├── entries/route.ts     # CRUD time entries
│   │       ├── projects/route.ts
│   │       ├── tags/route.ts
│   │       ├── users/route.ts       # Admin user management
│   │       └── sse/route.ts         # SSE endpoint for live updates
│   ├── components/
│   │   ├── ui/              # Design system primitives
│   │   ├── timer/           # Timer display, controls
│   │   ├── entries/         # Entry list, entry card
│   │   ├── reports/         # Charts, filters, tables
│   │   └── layout/          # Sidebar, top bar, bottom nav
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts   # Drizzle schema
│   │   │   ├── index.ts    # DB connection
│   │   │   └── migrations/ # SQL migrations
│   │   ├── redis.ts         # Redis/KV client
│   │   ├── auth.ts          # Auth.js config
│   │   └── utils.ts         # Shared helpers
│   ├── hooks/
│   │   ├── use-timer.ts     # Timer state + local tick
│   │   └── use-sse.ts       # SSE subscription hook
│   └── types/
│       └── index.ts         # Shared TypeScript types
├── drizzle.config.ts
├── tailwind.config.ts       # Vellum Ink design tokens
├── next.config.ts
├── package.json
└── .env.example
```

---

## Design System: Vellum Ink

The UI follows the "Tactile Editorial" design system from the Stitch AI designs.

### Key Principles
- **Paper-based surfaces:** Cream (#fbf9f5) base, tonal layering for depth
- **No-line rule:** No 1px borders for sectioning — use background color shifts
- **Typography:** Newsreader (serif) for headlines/numbers, Work Sans (sans) for body/UI
- **Ink-on-paper:** Never use pure #000 — use #31332f (on-surface)
- **Paper shadows:** `box-shadow: 0 12px 32px -4px rgba(49, 51, 47, 0.06)`
- **Intentional asymmetry:** Luxury margins, editorial spacing

### Color Tokens
- Primary: #366769 (oxidized mint)
- Secondary: #5c5e6e (lavender grey)
- Tertiary: #755a40 (dusty peach)
- Surface: #fbf9f5 (paper base)
- On-surface: #31332f (ink)

---

## Reports Engine

Admin detailed reports are server-side PostgreSQL queries via Next.js Server Components:

- **Filter by:** user, project, tag, date range, description (full-text search)
- **Group by:** user, project, tag, day/week/month
- **Aggregations:** total hours, entry count, per-project breakdown
- **Export:** CSV download
- **URL-based filters:** All filter state in URL params for sharing/bookmarking

---

## Deployment

1. **Vercel** — Next.js app, auto-deploys from Git
2. **Vercel Postgres** (or Neon) — Serverless PostgreSQL
3. **Vercel KV** — Serverless Redis for active timers
4. **Custom domain** — Connected via Vercel DNS

### Environment Variables
```
DATABASE_URL=           # PostgreSQL connection string
KV_URL=                 # Redis connection string
KV_REST_API_URL=        # Vercel KV REST URL
KV_REST_API_TOKEN=      # Vercel KV REST token
NEXTAUTH_SECRET=        # Auth.js secret
NEXTAUTH_URL=           # App URL
```

---

## Scaling Considerations

- **Timers are timestamps:** No server-side ticking. A million timers = a million Redis keys, each a few bytes.
- **SSE fan-out:** Each connected client holds one HTTP connection. Vercel Edge handles this at scale.
- **Reports on cold data:** Historical queries hit PostgreSQL indexes. Active timers are in Redis.
- **Serverless PostgreSQL:** Aurora Serverless or Neon scales compute on demand for heavy report queries.
- **Partitioning (future):** If time_entries grows past ~100M rows, partition by month on `started_at`.
