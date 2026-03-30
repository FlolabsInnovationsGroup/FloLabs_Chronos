# FloLabs Chronos — Architecture

## Overview

Chronos is FloLabs' internal time-tracking and team-management tool. It replaces Toggl for time capture, but the product goal is broader: admins need a controlled way to create projects, invite people into teams, and review team-wide time usage without exposing the same management surface to every account.

The V1 operating model is:
- Projects are global, but only admins can create or modify them.
- Every non-admin account belongs to one primary team.
- Access is role-scoped across three roles: `admin`, `team_lead`, `member`.
- Account creation is invite-only. There is no open self-registration.
- Invitations assign the invited user to a team automatically at account creation time.

---

## Product Model

### Roles

#### Admin
- Can create, edit, archive, and restore projects.
- Can create teams and manage all team memberships.
- Can invite users into any team.
- Can see all teams, all users, all time entries, and all reports.

#### Team Lead
- Belongs to exactly one team in V1.
- Can see all members of their team.
- Can see all time entries and reports for users in their team.
- Cannot create or modify projects.
- Cannot see users or reports outside their team.

#### Member
- Belongs to exactly one team in V1.
- Can see which team they belong to.
- Can see only their own entries and reports.
- Cannot create or modify projects.
- Cannot manage team membership or invitations.

### Team Model

V1 uses a **single primary team per user**. That keeps permissions and reporting simple:
- `users.team_id` stores the team assignment.
- A user can be in zero or one team.
- `team_lead` is expressed by `users.role = 'team_lead'`, not by a second membership table.

If multi-team membership becomes necessary later, the migration path is clear: replace `users.team_id` with a `team_memberships` join table and keep the rest of the authorization rules intact.

### Invitations

User onboarding is invite-based:
1. An admin creates an invitation for an email address and selects a team + role.
2. The system generates a one-time registration token.
3. The invite link points to `/register?invite=<token>`.
4. Registration is only allowed when the token is valid, unexpired, and matches the invite email.
5. On success, the new user is created and assigned to the invite's team automatically.

Delivery should be abstracted behind an invitation service:
- If an email provider is configured, send the email directly.
- If email delivery is not configured, still create the invite and return a shareable invite URL.

That keeps the onboarding workflow operational without coupling the core product to one email vendor.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend + API | **Next.js 16** (App Router) on **Vercel** | SSR, App Router, route handlers, zero-config deploys |
| Auth | **NextAuth.js v5** (Auth.js credentials) | Existing auth foundation, easy role/session enrichment |
| Database | **PostgreSQL** (Neon Serverless / Vercel-managed Neon) | Durable source of truth, strong relational querying |
| ORM | **Drizzle ORM** | Type-safe schema and queries |
| Real-time | **Redis** + **Server-Sent Events (SSE)** | Active timer state in Redis, fan-out through SSE |
| Styling | **Tailwind CSS** with Vellum Ink tokens | Matches the editorial product language |
| Validation | **Zod** | Shared input validation |
| Optional email | **Resend** or equivalent | Invitation email delivery without building SMTP plumbing |

### Why SSE over WebSocket?

For Chronos, **Server-Sent Events (SSE)** are simpler and sufficient:
- Timers are write-rare and read-frequent.
- Clients only need server-to-client updates for timer state changes.
- The UI computes elapsed time locally from `startedAt`.
- Redis pub/sub plus SSE fan-out remains lightweight for the expected scale.

---

## How Live Timers Work

**Timers are timestamps, not ticks.**

### Start Timer
1. User clicks "Start" -> API writes to Redis: `timer:{userId}` = `{ projectId, tagId, description, startedAt }`
2. API broadcasts a timer-start event on the Redis pub/sub channel
3. Connected SSE clients receive the event and update their local state

### Display Timer
- Client receives `startedAt`
- Client computes elapsed time locally with `Date.now() - startedAt`
- No per-second server events

### Stop Timer
1. API loads the active timer from Redis
2. API computes `durationMs`
3. API writes the completed entry to PostgreSQL
4. API removes the active timer from Redis
5. API broadcasts a timer-stop event

### Visibility Rules
- Admins can inspect all active timers
- Team leads can inspect active timers for users in their team
- Members can inspect only their own active timer

Authorization must be enforced in the route handlers, not only in `proxy.ts`.

---

## Data Model

```sql
-- Teams
CREATE TABLE teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Users
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  password              TEXT NOT NULL,
  role                  TEXT NOT NULL DEFAULT 'member', -- 'admin' | 'team_lead' | 'member'
  team_id               UUID REFERENCES teams(id),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  discord_webhook_url   TEXT,
  notify_on_start       BOOLEAN DEFAULT false,
  notify_on_stop        BOOLEAN DEFAULT false,
  daily_summary         BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Invitations
CREATE TABLE invitations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'member', -- 'team_lead' | 'member'
  team_id        UUID NOT NULL REFERENCES teams(id),
  token          TEXT UNIQUE NOT NULL,
  invited_by_id  UUID NOT NULL REFERENCES users(id),
  expires_at     TIMESTAMPTZ NOT NULL,
  accepted_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
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

-- Time entries
CREATE TABLE time_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  project_id     UUID NOT NULL REFERENCES projects(id),
  tag_id         UUID REFERENCES tags(id),
  description    TEXT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  stopped_at     TIMESTAMPTZ,
  duration_ms    BIGINT,
  notion_page_id TEXT,
  synced_at      TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ DEFAULT now(),
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_entries_user    ON time_entries(user_id, started_at DESC);
CREATE INDEX idx_entries_project ON time_entries(project_id, started_at DESC);
CREATE INDEX idx_entries_date    ON time_entries(started_at DESC);
CREATE INDEX idx_entries_tag     ON time_entries(tag_id) WHERE tag_id IS NOT NULL;
CREATE INDEX idx_users_team      ON users(team_id);
CREATE INDEX idx_invites_email   ON invitations(email);
CREATE INDEX idx_invites_team    ON invitations(team_id);
```

### Data Rules
- `users.email` remains globally unique.
- Pending invitations do not create user rows early; they reserve onboarding intent only.
- Invited emails cannot use open registration because open registration does not exist in V1.
- `admin` users may have `team_id = NULL`.
- `team_lead` and `member` should have a `team_id`.
- Deactivation is soft via `users.is_active = false`.

---

## Access Control

Authorization must be validated in **every route handler and server component that reads protected data**.

### Shared Permission Helpers

The app should centralize authorization with server-side helper functions:
- `isAdmin(session)`
- `isTeamLead(session)`
- `isMember(session)`
- `canManageProjects(session)`
- `canViewUser(session, targetUserId)`
- `scopeUserIdsForSession(session)` or equivalent team-aware query helpers

### Route Rules

| Surface | Admin | Team Lead | Member |
|---|---|---|---|
| `/projects` list | Yes | Yes | Yes |
| Create/edit/archive projects | Yes | No | No |
| `/team` page | All teams | Own team only | Own team only |
| Create invites | Yes | No | No |
| Create/edit teams | Yes | No | No |
| Reports | All users | Team users only | Own only |
| User management | All users | No direct user edits in V1 | No |

### Important Security Note

`proxy.ts` is only a UX guard. It is **not** the source of truth for authorization. Route handlers and server components must re-check role and team scope because Next.js proxy protection alone is not sufficient.

---

## Project Structure

```
FloLabs_Chronos/
├── ARCHITECTURE.md
├── CLAUDE.md
├── GAME_MASTER.md
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx        # Invite-only registration
│   │   ├── (dashboard)/
│   │   │   ├── timer/page.tsx
│   │   │   ├── projects/page.tsx
│   │   │   ├── team/page.tsx            # Team visibility varies by role
│   │   │   ├── reports/page.tsx
│   │   │   └── settings/page.tsx
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── [...nextauth]/route.ts
│   │       │   ├── register/route.ts
│   │       │   └── invitation/route.ts  # Invite validation lookup
│   │       ├── timer/
│   │       ├── entries/
│   │       ├── projects/
│   │       ├── reports/
│   │       ├── teams/                   # Team CRUD (admin)
│   │       ├── invitations/             # Invite creation/listing (admin)
│   │       ├── users/
│   │       ├── tags/
│   │       ├── sse/route.ts
│   │       └── cron/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   │   ├── db/
│   │   ├── auth.ts
│   │   ├── permissions.ts               # Shared role/team permission helpers
│   │   ├── invitations.ts               # Token generation + delivery abstraction
│   │   ├── redis.ts
│   │   ├── notion.ts
│   │   └── discord.ts
│   └── types/
├── drizzle.config.ts
├── vercel.json
└── .env.example
```

---

## Registration Flow

Chronos V1 is **invite-only**.

### Registration Rules
- `/register` requires a valid invite token.
- Without a valid invite, the page becomes an informational state that points users to sign in or contact an admin.
- The invite email is the only email allowed for that registration attempt.
- If the email already exists in `users`, registration returns `409`.
- If the invite is expired or already accepted, registration returns `410`.

### Recommended Endpoint Split
- `GET /api/auth/invitation?token=...` -> validate invite and return prefill data
- `POST /api/auth/register` -> create account from invite

That keeps the UI simple and removes the need for the client to infer invite validity.

---

## Reports Engine

Reports are server-side PostgreSQL queries with scope depending on the viewer:
- **Admin:** unrestricted across all users
- **Team Lead:** restricted to users whose `team_id` matches the lead's team
- **Member:** restricted to `session.user.id`

### Filter Model
- Filter by user, project, tag, date range, description
- Group by day, week, month, user, project
- Export CSV
- Store filter state in URL params

### Team-Scoped Reporting Rule

User-filter dropdowns must be derived from the same accessible scope as the report query. A team lead must never receive a global user list in the filter UI.

---

## Design System: Vellum Ink

The UI follows the "Tactile Editorial" system from the Stitch references.

### Principles
- Cream paper background: `#fbf9f5`
- Ink text: `#31332f`, never pure black
- No hard borders for layout sectioning
- Newsreader for editorial headers and numeric emphasis
- Work Sans for UI labels and controls
- Paper shadow: `0 12px 32px -4px rgba(49, 51, 47, 0.06)`

Use the existing design tokens and avoid generic admin-panel styling.

### Delayed Tooltips

Icon-only buttons across the UI use the `<Tooltip>` component (`src/components/ui/Tooltip.tsx`) to display a descriptive label after hovering for 3 seconds. This keeps the interface clean while remaining accessible to users who need to discover button actions. The tooltip uses Vellum Ink styling (dark ink background, cream text) and fades in smoothly. Apply `<Tooltip label="...">` around any new icon-only button.

---

## Deployment

1. **Vercel** for the Next.js deployment
2. **Neon Postgres** for durable relational storage
3. **Redis** for active timers and pub/sub
4. **Optional email provider** for invite delivery

### Environment Variables

```bash
DATABASE_URL=
KV_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
CRON_SECRET=
NOTION_API_KEY=
NOTION_DATABASE_ID=

# Optional invitation delivery
RESEND_API_KEY=
INVITE_FROM_EMAIL=
APP_URL=
```

`APP_URL` should be used when building absolute invite URLs outside request scope.

---

## Notion Backup

Notion remains a **secondary backup**, not the source of truth.

### Sync Rules
1. Select entries where `synced_at IS NULL OR synced_at < updated_at`
2. Create or update the corresponding Notion page
3. Persist `notion_page_id` and `synced_at`

If Notion is unavailable, sync retries on the next cron run. PostgreSQL remains authoritative.

---

## Discord Notifications

Discord webhook notifications remain optional and non-blocking:
- Timer started
- Timer stopped
- Daily summary

They should never block the primary timer or reporting flows.

---

## Scaling and Future Extensions

- Single-team membership keeps V1 authorization simple and easy to reason about.
- If the org needs cross-team staffing later, add a `team_memberships` table and migrate permission helpers to set-based membership checks.
- If project ownership becomes team-scoped, add `projects.team_id` and reuse the same access helper layer.
- If email delivery becomes mandatory, plug Resend into the invitation service without changing the registration contract.
