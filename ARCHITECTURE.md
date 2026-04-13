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
- The dashboard supports **light**, **dark**, and **system (OS)** appearance from the same components, driven by shared **`--c-*`** CSS variables on `:root` and `html.dark`.

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
- Notion Team Members data is the operational source of truth for **which teams** a **linked** user belongs to (the `Team` relation on their Team Member page), once `users.notion_team_member_id` is set.
- Chronos must **not** infer or match Team Member pages by user email or by name. Admins explicitly pick a Team Members row (search) or choose **create new** when inviting; that page id is stored on `invitations.notion_team_member_id` and copied to `users.notion_team_member_id` on registration. Admins can also set or clear the link when editing a member.
- When Chronos creates a **new** Team Member page from an invitation, it must populate the invited teams into the `Team` relation at creation time.
- Chronos now attempts to apply a Notion template during that Team Member create call: it uses `NOTION_TEAM_MEMBER_TEMPLATE_ID` when configured, otherwise it asks Notion to use the Team Members data source's default template.
- After creating a new Team Member page, Chronos also creates a related page in the separate Onboarding database (`NOTION_ONBOARDINGS_DB_ID`) and links it back through the Team Member page's `Onboarding` relation property.
- Chronos also creates the user in every relevant MasterClass database discovered from the MasterClasses index database (`NOTION_MASTERCLASSES_INDEX_DB_ID`). Each index row maps one or more Teams to a target MasterClass database; if multiple invited teams map to the same target database, Chronos deduplicates so only one MasterClass page is created in that database for the user.
- MasterClass pages created or repaired by Chronos use the exact title format `{full name}'s {MasterClass name}` based on the matching MasterClasses index row; legacy plain-name pages may still be reused when they match safely so duplicate pages are not created.
- When Chronos updates an **admin-selected** existing Team Member page for an invite, it should make only the minimal safe repairs needed for invite integrity: fill in a missing email, merge in any missing invited-team relations, create/link an Onboarding page when that relation is still empty, and ensure any newly-relevant MasterClass pages exist.
- For Onboarding pages and MasterClass pages, Chronos asks Notion to use the target data source's default template when the API/data source supports template creation; if Notion rejects that template flow, Chronos falls back to a plain page create instead of faking template content locally.
- Notion applies template content asynchronously after page creation. Chronos relies on the API-supported template flow for page structure/content, while still sending the critical invitation properties (`Name`, `Email`, `Team`, `Status=Onboarding`) in the Team Member create request so onboarding integrity is preserved.
- When a Chronos user is renamed by an admin, Chronos updates the Team Member page title in Notion only when `notionTeamMemberId` is set (no email or name fallback).
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
10. During invitation flow, the admin explicitly selects a Team Member page in Notion (search) or chooses **create new**; Chronos does not auto-resolve pages by name or email.
11. For a selected existing page, if `Email` or `Personal Email` is set on that page, it must match the invite email or invitation creation fails with a clear error; empty email fields are allowed.
12. Chronos then ensures the Team Member row (update or create), applies the configured/default Team Member template when creating, links Onboarding and Masterclasses per the operating rules above.
13. Chronos stores the Team Member page id on `invitations.notion_team_member_id` and copies it to `users.notion_team_member_id` when the user registers.

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
- `projects.created_by_id` records which admin created the project. Legacy rows created before this column existed may be backfilled to the primary admin (earliest active `role = admin` user) via `scripts/backfill-projects-created-by-admin.sql`.

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
| Styling | **Tailwind CSS** with Vellum Ink tokens + CSS variables | Editorial UI; light/dark palettes via `--c-*` on `:root` and `html.dark` |
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
2. Chronos requires a selected project and a non-empty description before a non-discard stop is allowed. A selected task is required only when the chosen project has `requires_task_on_stop = true`.
3. API computes `durationMs`.
4. API writes the completed entry to PostgreSQL.
5. API writes tag associations to `time_entry_tags`.
6. Task metadata is persisted on the entry row when present.
7. API removes the active timer from Redis.
8. API broadcasts a stop event.
9. Completed entries can then be synced to Notion and notified to Discord.
10. **Linked Notion task status (best-effort):** when a `notionTaskPageId` is present on the stopped timer, Chronos asynchronously attempts to set the corresponding row in the **Notion Tasks** database to **In progress** on a **Status** (or workflow-like **Select**) column, matching the option name case-insensitively. Failures do not block the stop. The same hook runs when a **completed** entry is created via `POST /api/entries` with a linked task.

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
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   TEXT NOT NULL,
  name                    TEXT NOT NULL,
  role                    TEXT NOT NULL DEFAULT 'member',
  team_id                 UUID NOT NULL REFERENCES teams(id),
  token                   TEXT NOT NULL UNIQUE,
  invited_by_id           UUID NOT NULL REFERENCES users(id),
  expires_at              TIMESTAMPTZ NOT NULL,
  accepted_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now(),
  notion_team_member_id   TEXT
);

CREATE TABLE invitation_team_memberships (
  invitation_id  UUID NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (invitation_id, team_id)
);

CREATE TABLE projects (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  color                   TEXT DEFAULT '#366769',
  icon                    TEXT DEFAULT 'folder',
  requires_task_on_stop   BOOLEAN NOT NULL DEFAULT false,
  archived                BOOLEAN DEFAULT false,
  created_by_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ DEFAULT now()
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

CREATE TABLE entry_discussions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id       UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  started_by_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message        TEXT NOT NULL,
  resolved_at    TIMESTAMPTZ,
  resolved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
-- Indexes: idx_discussions_entry, idx_discussions_started_by, idx_discussions_unresolved
```

### Data Rules
- `users.email` is globally unique.
- Duplicate-person detection may surface likely matches across `users` and `applicants`, but phase 1 is detection-only, not automatic merge.
- `users.team_id` is a compatibility/default pointer, not the full membership model.
- `team_memberships` stores true many-to-many membership.
- `invitations.team_id` is a compatibility/default pointer.
- `invitation_team_memberships` stores full invited membership intent.
- Tags are unique per `(name, user_id)`.
- Time entries never store a direct single tag column.
- Project linkage is optional for timer-created entries and may be filled in later.
- Task linkage is optional while the timer is running; stopping requires an explicit task selection only when the entry’s project has `requires_task_on_stop = true`.
- Description may still temporarily contain a pasted Notion task URL for compatibility with the Python task linker.
- Deleting a tag preserves the time entry.
- Deleting a project deletes linked time entries.
- Deleting a user cascades to their tags and membership rows; user deletion should still be product-gated by historical integrity rules.
- Admins may have `team_id = NULL`.
- Deleting an entry cascades to its discussions.
- Deleting a user who started a discussion cascades (discussion row is removed).
- Deleting a user who resolved a discussion sets `resolved_by_id = NULL` (SET NULL).

### Entry Discussions — Access Rules

Discussions are a lightweight async review mechanism for time entries.

| Action | Who can perform |
|---|---|
| Start a discussion | Admins and team leads on entries belonging to other users within their accessible scope. Users cannot discuss their own entries. |
| View discussions on an entry | Admins (all), team leads (within scope), members (own entries only). |
| List unresolved discussions | Admin: all; Team lead: where they are the starter OR entry owner is in their accessible user set; Member: own entries. |
| Resolve a discussion | Admin (any), discussion starter. |
| Delete a discussion | Admin (any), starter (only if unresolved). |
| Active-timer discussions | Not supported — active timers have no stable `entry_id` in Postgres until stopped. |

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

### Team membership rows (`team_memberships`)
- For each user with `users.notion_team_member_id` set, the cron loads that Team Member page from Notion and **replaces** that user's `team_memberships` from the page's `Team` relation (Notion team page ids mapped to Chronos `teams.id` via `teams.notion_page_id`). It also sets `users.team_id` to the first mapped team (compatibility).
- Users **without** `notion_team_member_id` are left unchanged by this step (invite-time and admin-edited memberships remain until an admin links a Team Member page).

### Team Member time-commitment updates
- Updating a user's `weekly_target_hours` in Chronos immediately updates the Notion Team Members database property named `Time Commitment` when `notionTeamMemberId` is set (no email fallback).

### Team Member role sync (Chronos → Notion)
- When an admin changes a user's Chronos role (`admin` / `team_lead` / `member`), Chronos attempts to patch the corresponding Team Member page in Notion: it looks for a **select** or **status** property named `Role`, `Chronos Role`, or `App Role`, and sets the option whose name matches (e.g. `Team Lead`, `Member`, `Admin`) when present in the schema.
- Chronos does **not** read or write a **LinkedIn Headline** property; that field was removed from the Team Members database in Notion and is not part of the integration contract.

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

**Tasks database resolution (in order):**
1. `NOTION_TASKS_DB_ID` environment variable, or the Control panel value stored as `notion.tasksDbId` in app config (via `getNotionConfig()` — same source as other Notion DB IDs).
2. If neither is set: load the Time Entries database (`NOTION_DATABASE_ID`), read the **`Task`** relation property schema, and use **`relation.database_id`** (single-property relations only; dual-property / multi-database relations are not resolved here).

### Search behavior
Implementation lives primarily in `src/lib/notion.ts` (`searchTasks`).

- **Workspace title search (primary):** `POST /v1/search` ([Notion Search API](https://developers.notion.com/reference/post-search)) finds pages whose titles match the query; results are filtered to rows whose parent is the configured Tasks database (`database_id` or `data_source_id`). This is faster and more reliable than scanning arbitrary database query sort order for deep rows.
- **Database query (secondary):** loads schema, resolves **data source** vs legacy **`POST /v1/databases/{id}/query`** when needed, applies `title` / `rich_text` **`contains`** filters only when the schema confirms that property type (avoids invalid filters when the retrieve-database payload omits usable title metadata).
- **Client-side matching:** `matchesTaskQuery` supports substring match, camelCase tokenization (e.g. `FloLabs` vs `Flo Labs`), and a compact alphanumeric fallback so UI filtering stays usable when Notion’s literal `contains` differs from user typing.
- **Fallback scan:** paginated unfiltered (or loosely filtered) queries walk additional pages when search + primary query return no matches.
- **Configuration:** `GET /api/tasks` exposes `meta.taskSearchConfigured` when an API key and tasks DB id (or derivable `NOTION_DATABASE_ID` path) are present; the UI must not treat “unconfigured” as overriding non-empty `tasks` after a successful response.

### Tooling
- **`pnpm run test:task-search`** — `scripts/test-task-search-integration.ts` loads `.env.local`, calls `searchTasks`, and prints `probeTaskSearchConfig()` diagnostics (unfiltered first page, resolved titles).
- **`pnpm test:e2e`** — Playwright (`e2e/task-search.spec.ts`): login, open task picker, assert `/api/tasks` JSON matches visible UI. `playwright.config.ts` uses `http://localhost:3000` to align with `NEXTAUTH_URL` (avoid `127.0.0.1` cookie issues); webServer readiness uses `/login` (200), not `/` (redirect).

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
| Team page (Users tab) | All users + full edit | All users in shared teams; may edit weekly target hours for those users | Only own row; may edit own weekly target hours |
| Create invites | Yes | No | No |
| Disable/delete invites | Yes | No | No |
| Reports | All users | Same scoped data as query (all teammates’ entries); may edit/delete/bulk-manage those entries | Own only |
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
User and tag filter options must match the same scope as the underlying entry query (admins: all users and all tags; team leads: accessible users and tags owned by any of those users; members: self only).

---

## Notion Sync & Discord Notifications

Chronos syncs completed time entries into a Notion Time Entries database and can send Discord notifications.

### Core rule
PostgreSQL is authoritative for Chronos. Notion is an integration target, not the primary transactional store.

### Notion integration supports
- creating or updating Notion pages for time entries
- matching/syncing Team Member relations
- handling edited and deleted entries
- searching the Notion Tasks database for task selection (workspace search + query + fallbacks)
- writing the `Task` relation directly when `notionTaskPageId` is present
- best-effort patch of linked task **Status** / workflow **Select** to **In progress** after a stopped timer or manual completed entry with a linked task (`setNotionLinkedTaskInProgressOnStop` in `src/lib/notion.ts`)

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
- `NOTION_MASTERCLASSES_INDEX_DB_ID` — database whose rows map teams to target MasterClass databases
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
- Modals are fixed full-viewport overlays: the **outer layer** scrolls (`overflow-y-auto` on the overlay) so tall content is not trapped in a short inner body; the dialog panel stays centered and grows with content.

### Light, dark, and system theme

Chronos ships a **dual palette** driven by CSS custom properties, not duplicate component trees. The user-facing mode is **light**, **dark**, or **system** (follow `prefers-color-scheme`).

- **Class hook:** `html.dark` toggles dark appearance. Tailwind’s `dark:` variant is wired with `@custom-variant dark (&:where(html.dark, html.dark *));` so utilities like `dark:bg-surface` resolve against the dark tree.
- **Token source:** `src/app/globals.css` defines every semantic color twice: under `:root` (light) and `html.dark` (dark). Examples: light primary `#366769`, dark primary `#8ecbce`; backgrounds move from cream paper (`#fbf9f5`) to near-black (`#121211`) with elevated surfaces on `surface-container-*` steps.
- **Tailwind bridge:** `@theme inline` maps `--color-*` entries to `var(--c-*)`, so classes such as `bg-background`, `text-on-background`, `bg-primary`, and `border-surface-container-highest` follow the active theme automatically.
- **Persistence and FOUC avoidance:** `ThemeScript` (`next/script`, `strategy="beforeInteractive"`) reads `localStorage` key `chronos-theme`. Stored values: **`"light"`**, **`"dark"`**, **`"system"`**. Missing or legacy values behave like **system** (use `prefers-color-scheme: dark` to choose class). It adds or removes `dark` on `<html>` before paint.
- **Runtime sync:** `ChronosThemeProvider` wraps the app in `src/app/layout.tsx`; it reapplies the class when the mode changes, when **system** preference changes (`matchMedia` listener), and when `storage` fires (other tabs). Same-tab updates use a `chronos-theme` window event.
- **Shared helpers:** `src/lib/chronos-theme.ts` — `parseChronosThemeMode`, `applyChronosThemeToDocument`, `resolveDarkFromMode`.
- **Chrome:** `TopBar` uses `ThemeToggle` — a **`DropdownSelect`** with **`hideTriggerLabel`** so the closed control shows only the **mode icon + chevron**; tooltip and `aria-label` describe the effective appearance (including “system → dark/light”).
- **Settings:** Settings → **Appearance** uses **`Select`** with three labeled options: **System (match device)**, **Light**, **Dark**.
- **`DropdownSelect`:** optional **`hideTriggerLabel`** / **`buttonAriaLabel`** for compact triggers (theme picker); list options still show icon + label.
- **Surfaces:** `body` uses `var(--c-background)` and `var(--c-on-background)`. Shared extras include `--c-overlay-scrim`, `--c-paper-shadow`, and focus rings (`--c-ring-primary`, `--c-ring-error`) with distinct light/dark values.
- **Brand mark:** The app chrome mark (`FlolabsMark` in `src/components/brand/FlolabsMark.tsx`) uses `fill="var(--c-primary)"` so the logo matches the theme primary in light and dark. Auth pages that still use `/flchron-logo.svg` as a static image keep a fixed fill inside the SVG file.
- **Migration aid:** `scripts/apply-semantic-theme-classes.mjs` can help replace legacy hard-coded hex Tailwind classes with semantic tokens.

New UI should prefer **semantic Tailwind tokens** (`bg-surface-container-low`, `text-primary`, …) or `var(--c-*)` in inline styles, not raw hex utilities, so both themes stay correct.

### Branding
- Desktop sidebar shows the FloLabs mark (`FlolabsMark`) as the primary persistent brand mark.
- On mobile, the top bar shows the same mark inside the menu toggle control for sidebar-style navigation.
- Desktop top bar does not duplicate the logo in the main title row (aside from the mobile-only header block).

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
├── e2e/
│   └── task-search.spec.ts
├── playwright.config.ts
├── scripts/
│   ├── apply-semantic-theme-classes.mjs
│   ├── test-task-search-integration.ts
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
│   │   ├── brand/
│   │   ├── entries/
│   │   ├── layout/
│   │   ├── reports/
│   │   ├── theme/
│   │   │   ├── ChronosThemeProvider.tsx
│   │   │   ├── ThemeScript.tsx
│   │   │   └── ThemeToggle.tsx
│   │   ├── timer/
│   │   └── ui/
│   ├── hooks/
│   ├── lib/
│   │   ├── db/
│   │   ├── auth.ts
│   │   ├── chronos-theme.ts
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

## Applicant identity unification (phase 1)

Chronos and Hephaestus share applicant and account data, so duplicate handling starts in the shared model.

Phase 1 behavior:
- detect likely duplicate people across Chronos applicants and shared user-linked applicant views
- use strong signals first: phone number, LinkedIn URL
- add weaker supporting signals: same full name, city/country, education, role applied for
- never auto-merge on name alone
- surface possible duplicates to HR for manual review
- do not merge or rewrite records automatically yet

Phase 2 behavior:
- persist duplicate review pairs in shared Chronos storage (`applicant_duplicate_reviews`)
- keep confidence score and machine-detected reasons up to date
- allow HR/admin review states: `pending`, `confirmed_duplicate`, `different_people`, `merged`
- expose this review state to downstream HR tools like hephaestus so duplicate handling is shared, not local-only

Future merge work should introduce a canonical person or identity layer above account emails.

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
