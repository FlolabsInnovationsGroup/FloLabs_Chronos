# FloLabs Chronos — Architecture

## Overview

Chronos is FloLabs' internal time-tracking and workforce coordination tool. It replaces Toggl for time capture, but the product is broader than a timer: it manages projects, role-scoped reporting, invite-only onboarding, Notion-backed team data, and downstream sync into Notion for operational visibility.

The current product model is:
- Projects are global, but only admins can create, modify, archive, restore, or delete them.
- Users can belong to multiple teams.
- Access is role-scoped across three roles: `admin`, `team_lead`, `member`.
- Account creation is invite-only.
- Invitations can assign one or more teams.
- Teams are sourced from Notion and synced into Chronos; Chronos is not the authority for creating/editing teams.
- Team membership is operationally Notion-driven.
- Tags are per-user, and time entries support multiple tags.
- Time entries can optionally link to a Notion Task page explicitly via stored task relation metadata.
- PostgreSQL is the application source of truth for Chronos data; Notion is the external operations mirror / integration layer.
- Discord webhooks are used for branded notifications about time-entry lifecycle events.

---

## Product Model

### Roles

#### Admin
- Can create, edit, archive, restore, and delete projects.
- Can view all teams, users, invitations, time entries, tags, and reports.
- Can create invitations for one or more teams.
- Can disable or delete pending invitation links.
- Can manage user records and delete users only when historical integrity permits it.
- Can see all tags, including creator names.
- Can use all reporting surfaces without scope restriction.

#### Team Lead
- Visibility scope is the union of all teams they belong to.
- Can see users and reports for accessible teams.
- Cannot manage projects.
- Cannot manage invitations unless explicitly expanded in a future feature.
- Cannot manage global team structure.

#### Member
- Can see only their own entries and reports.
- Can see their own team assignments in the UI.
- Cannot manage projects, invitations, or team structure.

### Team Model

Chronos supports **multiple teams per user**.

Key rules:
- `team_memberships` is the source of truth for Chronos' internal user ↔ team mapping.
- `users.team_id` remains as a legacy/default team pointer for compatibility with older logic and UI assumptions.
- A user may belong to zero, one, or many teams.
- `team_lead` access is derived from all teams they belong to.
- Teams themselves are imported from Notion and periodically synced.
- Manual team creation in Chronos is disabled; Notion owns team definitions.

### Team Membership Operating Rule

Chronos should be treated as **read-only for team memberships** from a product perspective.

That means:
- Notion Team Members data is the operational source of truth for membership intent.
- Before creating a Notion Team Member page from an invitation, Chronos must first try to reuse an existing page by exact normalized email.
- If no email match exists, Chronos must try a careful exact normalized-name lookup in the Team Members database.
- If exactly one normalized-name match exists, Chronos should reuse that page instead of creating a duplicate.
- If multiple plausible Team Member pages match the same email or normalized name, Chronos must fail the invitation flow with a clear ambiguity error instead of blindly creating another page.
- If Chronos creates an invitation and no matching Notion Team Member page exists, Chronos should create that page so the invite flow does not break integrity.
- When Chronos creates a missing Team Member page from an invitation, it must populate the invited teams into the `Team` relation at creation time.
- Chronos now attempts to apply a Notion template during that Team Member create call: it uses `NOTION_TEAM_MEMBER_TEMPLATE_ID` when configured, otherwise it asks Notion to use the Team Members data source's default template.
- After creating a new Team Member page, Chronos also creates a related page in the separate Onboarding database (`NOTION_ONBOARDINGS_DB_ID`) and links it back through the Team Member page's `Onboarding` relation property.
- When Chronos reuses an existing Team Member page, it should make only the minimal safe repairs needed for invite integrity: fill in a missing email, merge in any missing invited-team relations, and create/link an Onboarding page when that relation is still empty.
- For Onboarding pages, Chronos asks Notion to use the Onboarding data source's default template when the API/data source supports template creation; if Notion rejects that template flow, Chronos falls back to a plain page create instead of faking template content locally.
- Notion applies template content asynchronously after page creation. Chronos relies on the API-supported template flow for page structure/content, while still sending the critical invitation properties (`Name`, `Email`, `Team`, `Status=Onboarding`) in the Team Member create request so onboarding integrity is preserved.
- When a Chronos user is renamed by an admin, Chronos should also update the Team Member page name in Notion, first via stored `notionTeamMemberId` and then via email-based fallback resolution if the stored ID is missing.
- Chronos should not evolve into a freeform local membership editor that diverges from Notion.

### Invitations

User onboarding is invite-based:
1. An admin creates an invitation for an email, role, and one or more teams.
2. The system stores the invitation in `invitations` and all assigned teams in `invitation_team_memberships`.
3. The system generates a registration token.
4. The invite link points to `/register?invite=<token>`.
5. Registration is only allowed when the token is valid, unexpired, and matches the invite email.
6. The `/register` screen is also reused for password recovery: `/register?forgot=1` requests a reset email and `/register?reset=<token>` lets an existing user choose a new password.
7. First-time invite acceptance and reset-password completion both use reveal-password controls and a required password confirmation field before submit.
8. On success, the user is created and assigned to all invited teams via `team_memberships`.
9. The first team is still mirrored into `users.team_id` for compatibility.
10. During invitation flow, Chronos first tries to resolve an existing Notion Team Member page by exact normalized email, then by exact normalized name.
11. If exactly one existing Team Member page matches, Chronos reuses it and applies only minimal safe updates (missing email, missing invited-team relation entries, missing onboarding relation) instead of creating a duplicate.
12. If multiple existing Team Member pages plausibly match, Chronos blocks invitation creation with a clear ambiguity error so the team can fix Notion manually first.
13. If no match exists, Chronos creates the missing Notion Team Member page, attempts to apply the configured/default Team Member template, then creates and links a related Onboarding page using the Onboarding database's default template when the Notion API supports it.

Legacy compatibility remains in place:
- `invitations.team_id` is still present as a primary/default team pointer.
- `invitation_team_memberships` stores the full multi-team assignment.

Admins can disable or delete pending invitation links.

### Projects

Projects are global:
- All authenticated users can read selectable projects for timers and time entry editing.
- Timer start no longer requires a project; a running or completed timer may temporarily have `projectId = null`.
- Users may reassign the project of their own currently running timer from the active timer UI.
- Only admins can create, edit, archive, restore, or delete projects.
- Deleting a project also deletes linked time entries, with a warning/confirmation flow.

### Tags

Tags are **per-user**:
- Each user owns their own tag namespace.
- Tags are plain labels only — no color, no icon.
- Same tag names may exist for different users.
- Admins can see all tags with creator names.
- Time entries support multiple tags via `time_entry_tags`.
- Deleting a tag removes only the association, not the time entries.

### Time Entries

A time entry stores:
- user
- optional project
- description
- start / stop timestamps
- computed duration
- zero or more tags
- sync metadata for Notion
- optional explicit Notion Task relation fields

#### Current State: Task Assignment

Chronos now supports **native task selection**.

Implemented behavior:
- timer UI supports a searchable task picker backed by the Notion Tasks database
- create/manual log entry flows support the same task picker
- the visible edit modal in the entries list (`EntryCard` modal) also supports task reassignment
- recent-entry suggestions can carry forward previous task selections from the last 2 weeks
- selected tasks are stored locally as:
  - `notionTaskPageId`
  - `notionTaskTitle`
- Notion sync writes the `Task` relation directly when task metadata is present

#### Transitional Compatibility Path

A legacy compatibility workaround still exists in the operational environment:
- users may still paste the Notion Task URL into the time entry description
- a local Python script named **task linker** (living alongside the repo) can scan synced time entries
- it extracts the task page ID from pasted Notion URLs
- it looks up the corresponding task in the Notion Tasks database
- it writes the `Task` relation onto the Notion Time Entry page

This is no longer the preferred path, but it remains part of the real system until fully retired.

Relevant Notion Tasks DB URL:
- `https://www.notion.so/flolabsrd/b5a15559fffc4a4f97161bf12e6fb400?v=2d91fb6dc57044e2b93684c32b69a2e0&source=copy_link`
- Database ID: `b5a15559fffc4a4f97161bf12e6fb400`

#### Edit Modal Reality

There are two time-entry form paths in the codebase:
- `EntryForm.tsx` — shared create/edit form component
- `EntryCard.tsx` — the inline list-card edit modal actually used from the entry list UI

The entry-list edit experience must be considered authoritative for user-facing behavior, because that is the modal users interact with most often.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend + API | **Next.js 16** (App Router) on **Vercel** | SSR, route handlers, server components, straightforward deployment |
| Auth | **NextAuth.js v5** credentials flow | Session enrichment and app-level role checks |
| Database | **PostgreSQL** (Neon / Vercel-managed Neon) | Durable relational source of truth |
| ORM | **Drizzle ORM** | Type-safe schema and query layer |
| Real-time | **Redis** + **SSE** | Active timer state + fan-out |
| Styling | **Tailwind CSS** with Vellum Ink tokens | Editorial UI language |
| Validation | **Zod** | Shared request validation |
| External ops integration | **Notion API** | Teams, Team Members, Tasks, and time-entry mirror |
| Optional delivery | **Email provider** (future / optional) | Invitation delivery |
| Notifications | **Discord webhooks** | Branded embed notifications for entry lifecycle events |
| Transitional local integration | **Python task linker script** | Legacy task relation patching from description URLs |

---

## How Live Timers Work

**Timers are timestamps, not ticks.**

### Start Timer
1. User clicks Start.
2. API writes the active timer to Redis: `timer:{userId}`.
3. Stored timer payload includes optional `projectId`, `tagIds`, `description`, `startedAt`, and optional task metadata.
4. The timer can start with nothing filled in.
5. Clicking a recent suggestion while idle immediately starts a timer with that suggestion's values.
6. API broadcasts a start event via Redis pub/sub.
7. Connected SSE clients update local state.

### Display Timer
- Client computes elapsed time locally from `startedAt`.
- No server-side per-second ticking is required.

### Update Running Timer
1. Client PATCHes `/api/timer` while a session is active.
2. Chronos validates the payload against the authenticated user context.
3. Redis active-timer state is updated in place.
4. The matching running PostgreSQL row is also updated so crash recovery and stop-time persistence stay aligned.
5. Supported live edits include project reassignment, description updates, tag changes, and task reassignment.
6. Clicking a recent suggestion while a timer is already running safely applies that suggestion onto the active timer instead of starting a second timer.
7. The updated timer state is rebroadcast over SSE so the active UI stays consistent.

### Stop Timer
1. API loads the active timer from Redis.
2. Chronos requires both a non-empty description and a selected task before a non-discard stop is allowed.
3. API computes `durationMs`.
4. API writes the completed entry to PostgreSQL.
5. API writes tag associations to `time_entry_tags`.
6. Task metadata is persisted on the entry row when present.
7. API removes the active timer from Redis.
8. API broadcasts a stop event.
9. Completed entries can then be synced to Notion and notified to Discord.

### Visibility Rules
- Admins can inspect all active timers.
- Team leads can inspect active timers for accessible users.
- Members can inspect only their own active timer.
- The Users page now surfaces live timer state for visible users only, including an updating duration for the current running entry.
- That Users-page live state is sourced from Redis active timers and refreshed from existing SSE timer events rather than a separate polling-only subsystem.

Authorization must be enforced in route handlers and server-side data access, not only in `proxy.ts`.

---

## Data Model

```sql
-- Teams
CREATE TABLE teams (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  notion_page_id        TEXT UNIQUE,
  general_webhook_url   TEXT,
  meetings_webhook_url  TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Users
CREATE TABLE users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  TEXT UNIQUE NOT NULL,
  name                   TEXT NOT NULL,
  password               TEXT NOT NULL,
  role                   TEXT NOT NULL DEFAULT 'member',
  team_id                UUID REFERENCES teams(id),
  is_active              BOOLEAN NOT NULL DEFAULT true,
  discord_webhook_url    TEXT,
  notify_on_start        BOOLEAN DEFAULT false,
  notify_on_stop         BOOLEAN DEFAULT false,
  daily_summary          BOOLEAN DEFAULT false,
  weekly_target_hours    BIGINT DEFAULT 40,
  notion_team_member_id  TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE team_memberships (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, team_id)
);

CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE invitations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'member',
  team_id        UUID NOT NULL REFERENCES teams(id),
  token          TEXT NOT NULL UNIQUE,
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

CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#366769',
  icon        TEXT DEFAULT 'folder',
  archived    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX tags_name_user_unique ON tags(name, user_id);
CREATE INDEX idx_tags_user ON tags(user_id);

CREATE TABLE time_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id),
  project_id           UUID REFERENCES projects(id),
  description          TEXT NOT NULL,
  started_at           TIMESTAMPTZ NOT NULL,
  stopped_at           TIMESTAMPTZ,
  duration_ms          BIGINT,
  edited_field         TEXT,
  notion_page_id       TEXT,
  notion_task_page_id  TEXT,
  notion_task_title    TEXT,
  synced_at            TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ DEFAULT now(),
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE time_entry_tags (
  time_entry_id  UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  tag_id         UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (time_entry_id, tag_id)
);
```

### Data Rules
- `users.email` is globally unique.
- `users.team_id` is a compatibility/default pointer, not the full membership model.
- `team_memberships` stores true many-to-many membership.
- `invitations.team_id` is a compatibility/default pointer.
- `invitation_team_memberships` stores full invited membership intent.
- Tags are unique per `(name, user_id)`.
- Time entries never store a direct single tag column.
- Project linkage is optional for timer-created entries and may be filled in later.
- Task linkage is optional while the timer is running, but stopping requires an explicit task selection.
- Description may still temporarily contain a pasted Notion task URL for compatibility with the Python task linker.
- Deleting a tag preserves the time entry.
- Deleting a project deletes linked time entries.
- Deleting a user cascades to their tags and membership rows; user deletion should still be product-gated by historical integrity rules.
- Admins may have `team_id = NULL`.

---

## Teams Sync (Notion-Driven)

Teams are imported from the Notion Teams database and synced into Chronos.

**Notion Teams DB:** `NOTION_TEAMS_DB_ID`

Synced fields:
- Team name
- slug
- active/inactive status
- general webhook URL
- meetings webhook URL
- Notion page ID

### Sync endpoint
- `/api/cron/teams-sync`
- Intended schedule: every 15 minutes

### Sync rules
- Upsert by Notion page ID.
- Update changed metadata in Chronos.
- Soft-deactivate teams that disappear or become inactive in Notion.
- Invitation UI should only present active teams.

---

## Task Search & Task Relation Model

Chronos exposes a task search API:
- `GET /api/tasks?q=<query>`

This queries the Notion Tasks database and returns task candidates for UI selection.

### Search behavior
- the API detects and uses the Tasks DB schema dynamically
- it supports short queries such as `F`
- it falls back to a broader scan/filter path if the filtered Notion query is empty
- it can surface configuration errors in the response metadata for debugging

### Implemented UI surfaces
- timer UI task picker
- create/manual log time-entry modal
- entry-list edit modal (`EntryCard`)
- suggestion carryover from recent entries

### Persistence model
- selected task is stored as:
  - `notionTaskPageId`
  - `notionTaskTitle`
- Notion sync writes the `Task` relation directly when task metadata is present

### Transitional behavior
If a task was not explicitly selected in Chronos, the older pasted-link + Python task linker path may still be used.

---

## Start/End Editing Lock Rule

Time entry editing follows a one-sided locking rule:
- `edited_field` is `NULL | 'start' | 'end'`.
- Once one extreme is edited, the opposite extreme becomes permanently locked for that entry.
- Active timers cannot have time fields edited.
- `duration_ms` is recomputed whenever timestamps are changed.
- UI uses minute-level inputs only.

---

## Access Control

Authorization must be enforced in **every route handler and protected server read path**.

### Shared Permission Helpers
Use centralized helpers in `src/lib/permissions.ts`.

### Route Rules

| Surface | Admin | Team Lead | Member |
|---|---|---|---|
| Projects list | Yes | Yes | Yes |
| Create/edit/archive/delete projects | Yes | No | No |
| Tags page | All tags | Own tags | Own tags |
| Create/delete own tags | Yes | Yes | Yes |
| Team page | All visible teams/users | Accessible teams/users | Own assignments only |
| Create invites | Yes | No | No |
| Disable/delete invites | Yes | No | No |
| Reports | All users | Accessible users only | Own only |
| User management | Yes | No | No |
| Task search API | Authenticated users | Authenticated users | Authenticated users |

### Security Note
`proxy.ts` is only a UX guard. It is not authoritative authorization.

---

## Reports Engine

Reports are server-side PostgreSQL queries scoped by viewer permissions.

### Scope
- **Admin:** unrestricted
- **Team Lead:** accessible users across all their teams
- **Member:** self only

### Features
- Filter by user, project, tag, date range, description
- Search across descriptions, project names, tag names, and user names
- Debounced search input
- Group by day, week, month, user, project
- Configurable page sizes
- CSV export
- Detailed entry list with bulk operations

### Scope Rule
Filter dropdowns must never expose users outside the same queryable scope.

---

## Notion Sync & Discord Notifications

Chronos syncs completed time entries into a Notion Time Entries database and can send Discord notifications.

### Core rule
PostgreSQL is authoritative for Chronos. Notion is an integration target, not the primary transactional store.

### Notion integration supports
- creating or updating Notion pages for time entries
- matching/syncing Team Member relations
- handling edited and deleted entries
- searching the Notion Tasks database for task selection
- writing the `Task` relation directly when `notionTaskPageId` is present

### Edited-entry behavior
For completed entries edited through the API:
- Chronos updates the local PostgreSQL row
- Chronos immediately calls `syncAndNotifyEntry()`
- Notion is updated as part of the same edit lifecycle
- Discord edit notifications are also triggered from that same lifecycle
- silent swallowing of sync failures has been removed for this path, so task-edit problems do not fail invisibly anymore

### Expected env vars
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID` — Time Entries DB
- `NOTION_TEAM_MEMBERS_DB_ID` — Team Members DB used for Team Member page creation, membership sync, and Team Member relations on time entries
- `NOTION_ONBOARDINGS_DB_ID` — Onboarding DB used to create linked onboarding pages for new invitees
- `NOTION_TEAMS_DB_ID` — Teams DB
- `NOTION_TASKS_DB_ID` — Tasks DB
- `NOTION_TEAM_MEMBER_TEMPLATE_ID` — optional explicit Team Member template/page ID for invitation-created Team Member pages
- `NOTION_TEAM_MEMBER_TEMPLATE_TIMEZONE` — optional timezone used when Notion resolves template variables like `@today` / `@now` (defaults to `UTC` for internal integrations)
- `CRON_SECRET`

### Time entry properties synced to Notion
Depending on actual database schema detection, Chronos maps:
- description/title
- user
- project
- tags
- date range
- duration
- updated timestamp
- Chronos entry ID
- Team Member relation
- Task relation when task linkage is present and target schema supports it

### Discord notifications
- Per-user/team-member webhook URLs are resolved from Notion Team Member records and/or stored user config
- Notifications are sent as **Discord embeds**, not plain-text messages
- Embeds use FloLabs Chronos brand colors
- Entry notifications cover:
  - new completed entry
  - edited entry
  - deleted entry
- When present, linked task titles are included in the notification payload
- Edit notifications include a change summary, with old values struck through
- If a webhook cannot be resolved yet (for example the rollup/relation-backed webhook path is empty), the entry is still synced to Notion and its Notion status is left/set to **Processed** rather than **Notified**
- That `Processed` state acts as a queue marker for later delivery attempts when a webhook becomes available
- Notification failures are surfaced in lifecycle results instead of always failing silently

### Notion guest invite limitation
- Chronos does **not** programmatically invite Notion guests to a page/workspace page, because Notion's public API exposes users, content, and data-source operations but does not expose a documented endpoint for inviting a guest or sharing a page with a guest.
- Guest access to the Floffice page must still be granted through Notion's UI/admin flows outside Chronos.

---

## Design System: Vellum Ink

### Principles
- Cream paper background
- Ink-toned typography, not pure black
- Editorial hierarchy
- Newsreader for display emphasis
- Work Sans for interface controls
- Soft shadows, not hard chrome

### UI Rules
- Use custom dropdowns, not native `<select>` elements.
- Use `TagMultiSelect` for tag picking.
- Use task picker UI for explicit task selection instead of requiring a pasted link.
- Entry list cards surface linked task titles inline as badges when present.
- Icon-only buttons use delayed tooltips.
- Tooltip/info-dialog surfaces must render within the visible viewport, including inside overflow-constrained cards/modals and on mobile layouts.
- Destructive actions use confirmation modals where **Cancel is visually primary** and the destructive action is danger-styled.
- Modals must fit viewport height and scroll internally.

### Branding
- Sidebar shows the FloLabs logo as the primary persistent brand mark.
- Top bar no longer duplicates the logo.

### Project Color Palette
- `#366769` — deep teal
- `#5c5e6e` — slate
- `#a73b21` — warm red
- `#f08a24` — orange
- `#5aa9e6` — sky blue
- `#1f6fa8` — marine blue
- `#6f56d9` — violet
- `#8bcf7b` — light green

---

## Project Structure

```text
FloLabs_Chronos/
├── ARCHITECTURE.md
├── CLAUDE.md
├── GAME_MASTER.md
├── scripts/
│   ├── migrate-tags.ts
│   ├── migrate-edited-field.ts
│   ├── migrate-entry-tasks.ts
│   └── ...
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   └── api/
│   │       ├── auth/
│   │       ├── timer/
│   │       ├── entries/
│   │       ├── projects/
│   │       ├── reports/
│   │       ├── teams/
│   │       ├── invitations/
│   │       ├── users/
│   │       ├── tags/
│   │       ├── tasks/
│   │       ├── sse/
│   │       └── cron/
│   ├── components/
│   │   ├── entries/
│   │   ├── layout/
│   │   ├── reports/
│   │   ├── timer/
│   │   └── ui/
│   ├── hooks/
│   ├── lib/
│   │   ├── db/
│   │   ├── auth.ts
│   │   ├── permissions.ts
│   │   ├── notion.ts
│   │   ├── redis.ts
│   │   ├── discord.ts
│   │   └── entry-lifecycle.ts
│   └── types/
├── assets/
│   └── logo/
├── drizzle.config.ts
├── vercel.json
└── .env.example
```

---

## Deployment

- **Vercel** hosts the app
- **Neon Postgres** stores durable app data
- **Redis** stores active timers and cache/pub-sub state
- **Notion** is used for operational sync / mirror databases
- **Discord webhooks** handle branded notification delivery
- **Local Python task linker** may still be used during transition for entries that only contain pasted task URLs in descriptions

Current live deployment has used:
- project: `flo-labs-chronos`
- custom domain: `https://athensgreecemarathon.com`

---

## Documentation Rule

`ARCHITECTURE.md` should describe the **actual current contract** of the product, including transitional workarounds that are still in use.

If code and docs diverge:
1. decide whether the code is an intentional evolution or stale drift,
2. update the losing side,
3. keep this file aligned with implemented reality and near-term committed direction.
