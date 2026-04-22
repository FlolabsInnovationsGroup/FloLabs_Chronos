# Chronos identity refactor phases

Updated: 2026-04-22 Europe/Paris

## Goal

Move Chronos to a model where the leads/applicants database is the only identity source.
Chronos-specific persistence should remain only for app-specific operational data such as time entries, timers, tags, and related records.

## Phase plan

### Phase 1 — dependency map and stall detection
Status: complete

Deliverables:
- enumerate all code and schema dependencies on the Chronos `users` table
- separate logical dependencies from hard schema or foreign-key dependencies
- define a repeatable way to detect when the refactor is stalled

Current findings from direct repo scan:
- `users` is still referenced across auth, permissions, many API routes, dashboard pages, reports, timer flows, tags, discussions, settings, importer scripts, and the schema itself
- `chronosUserId` is embedded in applicants-linked flows and scripts
- `userEmailAliases` and `findUserByAnyEmail` still anchor login and recovery to the Chronos `users` table
- hard schema references to `users` remain in `src/lib/db/schema.ts`

#### Dependency buckets

##### 1. Immediately-switchable canonical-identity paths
These can move first to applicants as the source of truth without needing a full schema rewrite.

- Auth/session logic in `src/lib/auth.ts`
  - applicant role, activity state, profile picture, team linkage, and access gating can become the canonical session source
- Recovery and identity lookup flows in:
  - `src/app/api/auth/forgot-password/route.ts`
  - `src/app/api/auth/reset-password/route.ts`
  - `src/app/api/settings/emails/route.ts`
- Applicant-centered profile and status reads in:
  - `src/app/api/settings/route.ts`
  - `src/lib/user-activity.ts`
  - `src/app/api/users/route.ts`
- Notion Team Member linkage should use applicants fields as the canonical source:
  - `applicants.notionTeamMemberId`
  - applicant team/status sync paths in `teams-sync` and applicant import/update flows

##### 2. Compatibility paths requiring staged migration
These still read or join `users`, but can be migrated incrementally once auth/session source of truth is switched.

- Dashboard and report loaders:
  - `src/app/(dashboard)/reports/page.tsx`
  - `src/app/(dashboard)/team/page.tsx`
  - `src/app/(dashboard)/timer/page.tsx`
- API routes that assume a Chronos-local user identity for filtering, display names, ownership, or joins:
  - entries, reports, projects, teams, tags, discussions, timer start/stop, daily summary
- Import scripts and maintenance scripts that currently map by `users.email`, `users.id`, or `chronosUserId`
- Email alias utilities that still assume `user_email_aliases -> users.id`

##### 3. Hard blockers caused by foreign keys and ownership semantics
These prevent immediate removal of the `users` table.

- `time_entries.user_id` and related entry ownership semantics still point at `users.id`
- tags, discussions, replies, review records, and other authored or owned records still reference `users.id`
- session and permission helpers still assume a Chronos-local session user id maps directly onto those ownership FKs
- schema-level references in `src/lib/db/schema.ts` still point many tables to `users`

#### Phase 2 first cut

Status: **complete** (2026-04-21)

Phase 2 is the first safe canonical-identity switch, without pretending the schema migration is already solved.

Delivered:
1. **Auth** — `src/lib/auth.ts` resolves login via `findApplicantForCredentialEmail` (primary applicant email + alias-backed Chronos user), verifies password on `users`, issues JWT/session with `id` = applicant id and `chronosUserId` = `users.id`. JWT refresh re-reads applicant rows and migrates legacy tokens that still stored `users.id` as `id`.
2. **Recovery** — `forgot-password` resolves the applicant the same way as login; reset tokens remain on `users` (FK); GET `reset-password` already prefers applicant display fields.
3. **Notion linkage** — `teams-sync` drives membership sync from **`applicants.notion_team_member_id`** (not `users`), mirrors `users.notion_team_member_id` + `users.team_id`, and updates `applicants.team_id`. Entry delete/bulk delete / `entry-lifecycle` resolve Discord + Notion team-member id from applicant first.
4. **Access / ownership** — `src/lib/permissions.ts` uses `sessionOwnershipUserId` (`chronosUserId`) for `team_memberships`, entry scope, and discussions. API routes that write to user-FK tables use `chronosUserIdFromSessionUser`.
5. **Docs** — `ARCHITECTURE.md` documents canonical applicant vs compatibility `users`.

Follow-up slices (same Phase 2 contract — applicants canonical for reads, `users` only where FKs require it):
- **Notion–Discord cron** — `/api/cron/notion-sync` notifications use the merged entry user (applicant-first Team Member id and name), matching `syncEntryToNotionFull`, not `users.notion_team_member_id` alone.
- **Dashboard SSR** — `(dashboard)/timer` and `(dashboard)/reports` load tags, entries, weekly target, and initial discussions using `chronosUserId` / `requireChronosUserIdFromSessionUser`, not `session.user.id` (applicant id).

### Phase 3 — ownership migration (next)

Status: **first cut complete** (2026-04-22)

**Verdict:** Phase 2 is complete enough to begin Phase 3. Auth, API routes, cron paths, and dashboard SSR that touch Chronos FKs use `users.id` via `session.user.chronosUserId`; remaining work is schema and write-path migration, not more “session id shape” cleanup.

**First exact Phase 3 cut (single deliverable to unblock the rest):**

1. Add nullable `applicant_id` (uuid, FK → `applicants.id`, index) to `time_entries` — the highest-churn owned table. *(Done in schema: `src/lib/db/schema.ts`; run `pnpm exec tsx scripts/migrate-time-entries-applicant-id.ts` against each database.)*
2. Ship a migration script that backfills `time_entries.applicant_id` by joining `time_entries.user_id` = `users.id` = `applicants.chronos_user_id` (skip or log rows with no match). *(Done: `scripts/migrate-time-entries-applicant-id.ts`.)*
3. Dual-write: on create/update paths in entry APIs, set `applicant_id` from the signed-in applicant (`session.user.id`) whenever `chronosUserId` is present. *(Done: `POST /api/entries`, `PATCH /api/entries/[id]`, timer start/stop/PATCH; owner edits use `session.user.id`; admin/lead edits resolve the entry owner’s applicant via `applicants.chronos_user_id`.)*

Follow-on Phase 3 slices (order negotiable): repeat the same pattern for `entry_discussions`, `discussion_replies`, and Redis timer keys documentation/migration; then reduce or remove dual writes to `users` where safe.

**Tags slice (2026-04-22):**

1. Add nullable `tags.applicant_id` (FK → `applicants.id`, index) — same dual-ownership pattern as time entries. *(Schema: `src/lib/db/schema.ts`; run `pnpm run db:migrate:tags-applicant-id` per database.)*
2. Backfill script: `tags.user_id` = `applicants.chronos_user_id` → `applicant_id`. *(Done: `scripts/migrate-tags-applicant-id.ts`.)*
3. Dual-write: `POST /api/tags` sets `applicant_id` from the signed-in applicant when `chronosUserId` is present; reads and ownership checks use `whereTagsForLinkedUser` / `tagRowAccessibleBySession` in `src/lib/tag-applicant.ts` (timer PATCH/start, tag list, reports/timer SSR, `POST`/`PATCH` entries tag validation, bulk tag delete).

**Discussions + replies slice (2026-04-22):**

1. Add nullable `started_by_applicant_id`, `resolved_by_applicant_id` on `entry_discussions` and `author_applicant_id` on `discussion_replies` (FK → `applicants.id`, indexes). *(Schema: `src/lib/db/schema.ts`; run `pnpm run db:migrate:discussions-applicant-ids` per database.)*
2. Backfill from `applicants.chronos_user_id` for each user FK column. *(Done: `scripts/migrate-discussions-applicant-ids.ts`.)*
3. Dual-write: `POST /api/discussions` sets starter applicant id; `PATCH /api/discussions/[id]` sets resolver applicant id; `POST /api/discussions/[id]/replies` sets author applicant id. GET handlers and timer SSR include the new fields on `EntryDiscussion` / `DiscussionReply`.
4. Scope: `discussionStarterMatchesViewer` + `canResolveDiscussion` treat the viewer as the starter when either `chronosUserId` matches `startedById` or session applicant id matches `startedByApplicantId`. Team-lead unresolved list filters include the same applicant-id match. Timer `DiscussionCard` uses `viewerChronosUserId` and `viewerApplicantId` so resolve controls work with Phase 2 session shape.

**Time-entry read-path slice (2026-04-22):**

1. Add `whereTimeEntriesForLinkedUser` in `src/lib/time-entry-applicant.ts` to prefer canonical `time_entries.applicant_id` and fall back to `user_id` only for rows not backfilled yet.
2. Use that scope in recent-suggestions, timer dashboard SSR, timer PATCH/stop running-entry lookup, reports SSR, `/api/entries` + `/api/reports` self-owner reads, member discussion entry lookup, daily summaries, and user-delete ownership checks so the hottest entry-owning reads stop assuming `time_entries.user_id` is canonical.
3. Keep admin/team-lead multi-user scopes on `user_id` for now, and keep joins to `users` only for display compatibility (`name`, weekly target), not row ownership.

**Notion sync + lifecycle owner-resolution slice (2026-04-22):**

1. `GET /api/cron/notion-sync` now resolves the applicant profile for each entry by preferring `time_entries.applicant_id` and only falling back to `applicants.chronos_user_id = time_entries.user_id` for rows not backfilled yet.
2. `src/lib/entry-lifecycle.ts` uses the same applicant-first join when hydrating entries for Notion sync / Discord notification work, so background sync paths stop assuming `users.id` is the canonical bridge to applicant profile data.
3. `users` stays joined only as the temporary FK/display compatibility row; applicant-facing name/email/team-member identity now reads canonically from `applicant_id` first.

**Bulk entry ownership slice (2026-04-22):**

1. `POST /api/entries/bulk` now loads `time_entries.applicant_id` alongside `user_id` when validating access.
2. Self-owner bulk actions (`delete`, `changeProject`) treat the signed-in applicant as canonical: allow rows where `applicant_id = session.user.id`, with `user_id = chronosUserId` fallback only for non-backfilled entries.
3. Admin/team-lead bulk scopes remain keyed on Chronos `user_id` for now, matching the rest of the Phase 3 multi-user compatibility layer.

**Discussion actor display slice (2026-04-22):**

1. Added `chronosActorDisplay(...)` in `src/lib/chronos-user-notion.ts` so discussion/reply actors prefer canonical applicant identity when `startedByApplicantId` / `resolvedByApplicantId` / `authorApplicantId` is present.
2. `GET /api/discussions`, `GET /api/discussions/entry/[entryId]`, `PATCH /api/discussions/[id]`, and `/api/discussions/[id]/replies` now return applicant-first actor names instead of reading `users.name` alone.
3. Fallback remains `users`-based for rows that are not backfilled yet, preserving compatibility while discussion actor presentation stops assuming `users` is the canonical profile source.

**Entry/report owner display slice (2026-04-22):**

1. Added batched `chronosEntryOwnerDisplayMap(...)` in `src/lib/chronos-user-notion.ts` so time-entry owner display can resolve applicant-first without per-row lookups.
2. `GET /api/entries`, `GET /api/reports`, and the dashboard reports page now prefer applicant name/email when `time_entries.applicant_id` is present, while still falling back to linked `users` rows for legacy entries.
3. CSV export and grouped report labels now reflect the canonical applicant-facing owner identity instead of relying on `users.name` alone.

**Users/team directory overlay slice (2026-04-22):**

1. `GET /api/users` now actually overlays linked applicant profile fields (`name`, `email`, `role`, `teamId`, `isActive`, `weeklyTargetHours`, `profilePictureUrl`, `notionTeamMemberId`, `status`) instead of leaving the applicant-first maps empty.
2. `GET /api/teams/[id]/members` now prefers applicant profile fields for member identity/status in team views, with `users` fallback for legacy or unlinked rows.
3. This keeps shared directory surfaces aligned with Phase 3’s applicant-canonical identity model without changing Redis timer keys or other Phase 4 live-state infrastructure yet.

**Timer dashboard identity slice (2026-04-22):**

1. The timer dashboard page now resolves week/recent entry owners with the same batched applicant-first display map used in entries/reports, so timer history no longer falls back to `users.name/email` for backfilled rows.
2. Initial discussion and reply payloads on the timer page now prefer applicant-canonical actor names via `chronosActorDisplay(...)`.
3. Weekly target hours on the timer page now prefer `applicants.weekly_target_hours`, with linked-applicant and `users` fallback for legacy rows.

**Daily summary identity slice (2026-04-22):**

1. `GET /api/cron/daily-summary` now prefers the linked applicant profile when naming the summary recipient.
2. Daily summary entry payloads now resolve time-entry owners through the same batched applicant-first display map used in entries/reports/timer history.
3. Legacy `users` rows still remain as fallback for non-backfilled entries, keeping the cron path compatible while removing one more `users`-canonical assumption.

Remaining for Phase 4+: optional removal of legacy `users`-only columns and FKs once nothing reads them.

#### Explicit conclusion

Phase 1 confirms that the refactor did not fail because the idea was vague. It failed because `users` is both:
- a logical identity source in auth and profile code, and
- a hard schema anchor for owned Chronos records

That means the correct path is staged removal, beginning with applicants-canonical auth and access, then ownership migration, then schema removal.

## Stall detection mechanism

Use both signals below:

1. **Commit heartbeat**
   - if no Chronos refactor commit lands within 90 minutes during active work, treat the phase as stalled

2. **Phase artifact requirement**
   - each phase must produce one concrete artifact before it is considered moving:
     - Phase 1: dependency map note committed
     - Phase 2: auth/applicant-canonical code commit
     - Phase 3: ownership migration or compatibility-layer commit
     - Phase 4: schema-removal or final deprecation commit
   - if no new artifact exists, the phase is stalled even if there were exploratory attempts

## Phase 1 reference (complete)

Phase 1 required: dependency buckets, hard blockers, and Phase 2 first cut — all recorded above.
