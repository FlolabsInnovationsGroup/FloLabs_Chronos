# Chronos identity refactor phases

Updated: 2026-04-21 Europe/Paris

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

Remaining for Phase 3+: migrate FKs off `users` where feasible; reduce dual writes.

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

## Next concrete completion condition for Phase 1

Phase 1 is complete only when this note is expanded with:
- grouped dependency buckets
- explicit hard blockers
- the exact first schema or code slice for Phase 2

At that point, send the user a Phase 1 complete message and begin Phase 2.
