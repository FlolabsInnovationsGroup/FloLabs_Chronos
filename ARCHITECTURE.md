# FloLabs Chronos — Architecture

## Overview

Chronos is FloLabs' internal time-tracking and team-management tool. It replaces Toggl for time capture, but the product goal is broader: admins need a controlled way to create projects, invite people into teams, and review team-wide time usage without exposing the same management surface to every account.

The V1 operating model is:
- Projects are global, but only admins can create, modify, or delete them.
- Every non-admin account belongs to one primary team.
- Access is role-scoped across three roles: `admin`, `team_lead`, `member`.
- Account creation is invite-only. There is no open self-registration.
- Invitations assign the invited user to a team automatically at account creation time.
- Tags are per-user. Each user manages their own tags. Admins can see all tags.
- Time entries support multiple tags via a many-to-many join table.

---

## Product Model

### Roles

#### Admin
- Can create, edit, archive, delete, and restore projects.
- Can create teams and manage all team memberships.
- Can invite users into any team.
- Can disable or delete pending invitation links.
- Can delete team members (only if they have no time entries).
- Can see all teams, all users, all time entries, all tags, and all reports.

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

Chronos now supports **multiple teams per user**.
- The Team page member edit modal uses multi-select and saves all selected teams.
- `team_memberships` is the source of truth for user ↔ team membership.
- `users.team_id` remains only as a legacy primary/default team pointer for backward compatibility.
- A user can belong to zero, one, or many teams.
- `team_lead` is still expressed by `users.role = 'team_lead'`, but their visibility scope is the union of all teams they belong to.

### Tags Model

Tags are **per-user**:
- Each user creates and manages their own tags.
- Tags have no color or icon — they are plain labels.
- Tags are unique per user (same name can exist across different users).
- Normal users only see their own tags.
- Admins can see all tags on the Tags page with the creator's name.
- Time entries can have **multiple tags** (many-to-many via `time_entry_tags` join table).
- When a tag is deleted, time entries are preserved — only the tag association disappears.
- When a user is deleted, their tags are cascade-deleted.
- The tag selector supports multi-select and inline creation of new tags.

### Invitations

User onboarding is invite-based:
1. An admin or sync job creates an invitation for an email address and selects one or more teams + role. The Team page invitation UI uses multi-select for teams.
2. The system generates a one-time registration token.
3. The invite link points to `/register?invite=<token>`.
4. Registration is only allowed when the token is valid, unexpired, and matches the invite email.
5. On success, the new user is created and assigned to all invited teams automatically via `team_memberships`.

Invitation membership is stored in `invitation_team_memberships`. `invitations.team_id` remains as a legacy primary/default team pointer for compatibility.

Admins can disable or delete pending invitation links from the Team page.

Delivery should be abstracted behind an invitation service:
- If an email provider is configured, send the email directly.
- If email delivery is not configured, still create the invite and return a shareable invite URL.

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

---

## How Live Timers Work

**Timers are timestamps, not ticks.**

### Start Timer
1. User clicks "Start" → API writes to Redis: `timer:{userId}` = `{ projectId, tagIds, description, startedAt }`
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
4. API inserts tag associations into `time_entry_tags`
5. API removes the active timer from Redis
6. API broadcasts a timer-stop event

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
  role                  TEXT NOT NULL DEFAULT 'member',
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
  role           TEXT NOT NULL DEFAULT 'member',
  team_id        UUID NOT NULL REFERENCES teams(id),
  token          TEXT UNIQUE NOT NULL,
  invited_by_id  UUID NOT NULL REFERENCES users(id),
  expires_at     TIMESTAMPTZ NOT NULL,
  accepted_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE invitation_team_memberships (
  invitation_id  UUID NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (invitation_id, team_id)
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

-- Tags (per-user, no color, no icon)
CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX tags_name_user_unique ON tags(name, user_id);
CREATE INDEX idx_tags_user ON tags(user_id);

-- Time entries
CREATE TABLE time_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  project_id     UUID NOT NULL REFERENCES projects(id),
  description    TEXT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  stopped_at     TIMESTAMPTZ,
  duration_ms    BIGINT,
  notion_page_id TEXT,
  synced_at      TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ DEFAULT now(),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Many-to-many: time entries ↔ tags
CREATE TABLE time_entry_tags (
  time_entry_id  UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  tag_id         UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (time_entry_id, tag_id)
);

CREATE INDEX idx_entries_user    ON time_entries(user_id, started_at DESC);
CREATE INDEX idx_entries_project ON time_entries(project_id, started_at DESC);
CREATE INDEX idx_entries_date    ON time_entries(started_at DESC);
CREATE INDEX idx_entry_tags_entry ON time_entry_tags(time_entry_id);
CREATE INDEX idx_entry_tags_tag   ON time_entry_tags(tag_id);
CREATE INDEX idx_users_team       ON users(team_id);
CREATE INDEX idx_invites_email    ON invitations(email);
CREATE INDEX idx_invites_team     ON invitations(team_id);

CREATE TABLE team_memberships (
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, team_id)
);
```

### Data Rules
- `users.email` remains globally unique.
- Tags are unique per (name, user_id), not globally.
- Time entries no longer have a direct `tag_id` column; tags are linked via `time_entry_tags`.
- Pending invitations do not create user rows early; they reserve onboarding intent only.
- `admin` users may have `team_id = NULL`.
- `team_lead` and `member` should have a `team_id`.
- Deactivation is soft via `users.is_active = false`.
- Deleting a user cascades to their tags and tag associations.
- Deleting a project also deletes all linked time entries.
- Deleting a tag only removes associations; time entries are preserved.

### Teams Model (Notion-Driven)

Teams are imported and kept in sync from the Notion Teams database (`NOTION_TEAMS_DB_ID`). Manual team creation in the UI is disabled — teams are managed in Notion.

Additional `teams` columns:
- `is_active BOOLEAN NOT NULL DEFAULT true` — synced from Notion Status; Active → true, others → false
- `notion_page_id TEXT UNIQUE` — Notion page ID, used as upsert key
- `general_webhook_url TEXT` — Discord webhook for general team notifications
- `meetings_webhook_url TEXT` — Discord webhook for meetings channel notifications

**Sync cron:** `/api/cron/teams-sync` (every 15 min)
- Paginates all pages in the Notion Teams DB
- Upserts each team by `notionPageId` (INSERT … ON CONFLICT UPDATE name, slug, isActive, generalWebhookUrl, meetingsWebhookUrl, updatedAt)
- Soft-deactivates any Chronos team whose `notionPageId` no longer appears in Notion

---

### Start/End Editing Lock Rule
- `time_entries.edited_field` is `NULL | 'start' | 'end'`.
- Once `edited_field` is set, the opposite field is permanently locked for that entry.
  - If `edited_field = 'start'`, PATCH requests that include `stoppedAt` are rejected (400).
  - If `edited_field = 'end'`, PATCH requests that include `startedAt` are rejected (400).
- When editing an unedited entry, `edited_field` is set to whichever extreme was changed.
- Active timers (no `stopped_at`) cannot have either time field edited.
- `duration_ms` is recomputed whenever `started_at` or `stopped_at` changes.

---

## Access Control

Authorization must be validated in **every route handler and server component that reads protected data**.

### Shared Permission Helpers

The app centralizes authorization with server-side helper functions in `src/lib/permissions.ts`:
- `isAdmin(session)`
- `isTeamLead(session)`
- `isMember(session)`
- `canManageProjects(session)`
- `canManageTeams(session)`
- `canManageInvitations(session)`
- `getAccessibleUserIds(session)`
- `getAccessibleUsers(session)`
- `getAccessibleTeams(session)`

### Route Rules

| Surface | Admin | Team Lead | Member |
|---|---|---|---|
| `/projects` list | Yes | Yes | Yes |
| Create/edit/archive/delete projects | Yes | No | No |
| `/tags` page | All tags (with creator name) | Own tags | Own tags |
| Create/delete own tags | Yes | Yes | Yes |
| `/team` page | All teams | Own team only | Own team only |
| Create invites | Yes | No | No |
| Disable/delete pending invites | Yes | No | No |
| Create/edit teams | Yes | No | No |
| Reports | All users | Team users only | Own only |
| User management | All users; delete if no entries | No | No |

### Important Security Note

`proxy.ts` is only a UX guard. It is **not** the source of truth for authorization. Route handlers and server components must re-check role and team scope.

---

## Project Structure

```
FloLabs_Chronos/
├── ARCHITECTURE.md          # Product model, data model, access rules
├── CLAUDE.md                # Coding guardrails for agents
├── GAME_MASTER.md           # Implementation tracker
├── scripts/
│   ├── seed.ts              # Bootstrap admin + sample data
│   └── migrate-tags.ts      # One-time migration for per-user tags
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── timer/page.tsx
│   │   │   ├── projects/page.tsx
│   │   │   ├── tags/page.tsx
│   │   │   ├── team/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   └── settings/page.tsx
│   │   └── api/
│   │       ├── auth/
│   │       ├── timer/
│   │       ├── entries/
│   │       │   └── bulk/route.ts
│   │       ├── projects/
│   │       ├── reports/
│   │       ├── teams/
│   │       ├── invitations/
│   │       ├── users/
│   │       ├── tags/
│   │       ├── sse/route.ts
│   │       └── cron/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── DropdownSelect.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── TagMultiSelect.tsx
│   │   │   └── Tooltip.tsx
│   │   ├── entries/
│   │   ├── layout/
│   │   ├── reports/
│   │   └── timer/
│   ├── hooks/
│   ├── lib/
│   │   ├── db/
│   │   ├── auth.ts
│   │   ├── permissions.ts
│   │   ├── invitations.ts
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
- Without a valid invite, the page shows an informational state.
- The invite email is the only email allowed for that registration attempt.
- If the email already exists in `users`, registration returns `409`.
- If the invite is expired or already accepted, registration returns `410`.

---

## Reports Engine

Reports are server-side PostgreSQL queries with scope depending on the viewer:
- **Admin:** unrestricted across all users
- **Team Lead:** restricted to users whose `team_id` matches the lead's team
- **Member:** restricted to `session.user.id`

### Features
- Filter by user, project, tag, date range, description
- Search across descriptions, project names, tag names, and user names (ILIKE)
- 2-second debounced search input
- Group by day, week, month, user, project
- Configurable page size: 25, 50, 100, 250, 500, or All
- Export CSV
- Detailed entry list with multi-select and bulk operations
- Store filter state in URL params

### Team-Scoped Reporting Rule

User-filter dropdowns must be derived from the same accessible scope as the report query. A team lead must never receive a global user list in the filter UI.

---

## Design System: Vellum Ink

### Principles
- Cream paper background: `#fbf9f5`
- Ink text: `#31332f`, never pure black
- No hard borders for layout sectioning
- Newsreader for editorial headers and numeric emphasis
- Work Sans for UI labels and controls
- Paper shadow: `0 12px 32px -4px rgba(49, 51, 47, 0.06)`

### Custom Dropdowns

All dropdown menus use the `DropdownSelect` component (`src/components/ui/DropdownSelect.tsx`) instead of native `<select>` elements. This ensures the opened dropdown panel matches Vellum Ink styling (rounded edges, Work Sans font, cream background, no browser-native contours) and works consistently on mobile browsers.

### Tag Multi-Select

The `TagMultiSelect` component (`src/components/ui/TagMultiSelect.tsx`) provides a multi-tag picker with inline tag creation. It replaces all single-tag selectors in timer and entry flows.

### Delayed Tooltips

Icon-only buttons use the `<Tooltip>` component to display a descriptive label after hovering for 3 seconds. Apply `<Tooltip label="...">` around any new icon-only button.

### Destructive Action Modals

All destructive actions (delete member, delete project, delete tag, disable invite, delete entries) must use a confirmation modal where **Cancel is the highlighted/primary button** and the destructive action uses the danger variant.

---

## Project Colors

The project color palette:
- `#366769` — deep teal
- `#5c5e6e` — slate
- `#a73b21` — warm red
- `#f08a24` — orange
- `#5aa9e6` — sky blue
- `#1f6fa8` — marine blue
- `#6f56d9` — violet
- `#8bcf7b` — light green

---

## Deployment

1. **Vercel** for the Next.js deployment
2. **Neon Postgres** for durable relational storage
3. **Redis** for active timers and pub/sub
4. **Optional email provider** for invite delivery

---

## Notion Backup

Notion remains a **secondary backup**, not the source of truth. PostgreSQL is authoritative.

---

## Notion Sync & Discord Notifications

### Cron: `/api/cron/notion-sync` (every 5 minutes)

The cron job replicates completed time entries to the Notion Time Entries DB and notifies users via Discord.

#### Env Vars Required
- `NOTION_API_KEY` — Notion integration token
- `NOTION_DATABASE_ID` — Time Entries DB (`297a157695518075ab6cea94e60e4220`)
- `NOTION_ONBOARDINGS_DB_ID` — Onboardings/Team Members DB (`a1a106fab63548089279dc54d63eab89`)
- `NOTION_TEAMS_DB_ID` — Teams DB (`9828e33b94e64dcba86f8b4ad7a21a23`)
- `CRON_SECRET` — Bearer auth for the cron endpoint

#### Notion Page Properties
Each time entry page in Notion has:
- `User Key` (title) — `"{name} — {date}"`
- `Entry ID` (rich_text) — Chronos UUID for deduplication
- `Project` (select)
- `Tags` (multi_select)
- `Date` (date range: startedAt → stoppedAt)
- `Updated` (date)
- `Duration` (number, in seconds)
- `Description` (rich_text)
- `Team Member` (relation → Onboardings DB page)
- `Status` (status: `Processed` | `Edited` | `Deleted` | `Notified` | `Ignored`)

#### Status Flow
- New entry synced → `Processed`
- Entry updated (syncedAt < updatedAt) → `Edited`
- Entry missing from Chronos DB → `Deleted`

#### Team Member Resolution
The `Team Member` relation is resolved by fuzzy Jaccard token matching between `users.name` and Onboardings DB page titles. The name index is cached in Redis for 2 hours (`notion:team-index`).

#### Discord Notifications
- Per-user Discord webhook URL stored in `users.discord_webhook_url`.
- Messages are **plain-text Markdown** (not embeds).
- New entry → `buildEntryAddedMessage`
- Edited entry → `buildEntryEditedMessage`
- Deleted entry → `buildEntryDeletedMessage`
- Discord sends are fire-and-forget with 429 backoff. Failures do not abort the cron.
