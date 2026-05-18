# Chronos Data Model Governance & Canonical Identity Definition

**Version:** 1.1.0
**Date:** 2026-05-18
**Owner:** Oliver / FloLabs Engineering
**Status:** Updated — reflects the `flolabs_users` unified identity model (post-Phase 3 unification).

---

## 1. Canonical Identity Principle

Every person in the FloLabs system has a single authoritative record in the **`flolabs_users`** table (mapped in Drizzle as `users`). This is a **shared table** — both Chronos and Hephaestus International use the same physical `flolabs_users` PostgreSQL table on the shared Neon database.

There is **no separate `applicants` table** in the current production schema. The Phase 3 identity refactor consolidated all applicant-canonical data into `flolabs_users`. References to `applicants.id` or `applicants` table in older notes are historical artifacts from before the unification.

**Session mapping (current):**
- `session.user.id` → `flolabs_users.id` (canonical)
- `session.user.chronosUserId` → `flolabs_users.id` (same value — both point to `flolabs_users` after unification)

**Legacy note:** Before unification, `session.user.id` pointed to `applicants.id` and `session.user.chronosUserId` pointed to `users.id` as a separate compatibility layer. That two-table model is no longer active. Code still referencing `applicants.id` vs `users.id` as distinct tables is stale.

---

## 2. Defined Identifiers

### A. FloLabs User ID (The Canonical Identifier)

- **What it is:** The primary system-level identifier for any person tracked in FloLabs — internal member, admin, or candidate.
- **Table:** `flolabs_users.id` (Drizzle export name: `users`)
- **Format:** UUID v4
- **Immutability:** Never changes throughout the lifecycle of the person record.
- **Use case:** Auth session identity, all data lookups, profile resolution, and canonical ownership for all code.
- **Shared table:** Hephaestus International reads and writes to the same `flolabs_users` table. Hephaestus HR edits (status changes, renames, merges) are immediately visible in Chronos.

### B. Legacy Dual-Write Columns (`flolabs_id` / `applicant_id`)

- **What they are:** Several tables (`time_entries`, `tags`, `entry_discussions`, `discussion_replies`) have both `flolabs_id` (canonical, current name) and `applicant_id` (deprecated alias). Both were dual-written during the Phase 3 migration and point at `flolabs_users.id`.
- **Current guidance:** `flolabs_id` is the canonical column. The `applicant_id` column is deprecated and kept only for historical row compatibility. New code should use `flolabs_id` when referencing the owner on these tables.
- **Helper:** `whereTimeEntriesForLinkedUser(userId, applicantId)` queries by both `user_id` AND `flolabs_id` for correct ownership resolution across backfilled and non-backfilled rows.

### C. External System IDs (Non-Canonical)

- **Examples:** Notion page IDs, HubSpot record IDs, Discord IDs.
- **Status:** Foreign keys and integration references only. Must not be used as primary join keys for identity-critical operations.
- **Pattern:** All external ID lookups pass through dedicated helpers or stored lookup columns (e.g. `flolabs_users.notion_team_member_id`, `teams.notion_page_id`).

---

## 3. Identity Resolution Rules

### 3.1 Auth and Session
- NextAuth v5 credentials provider authenticates against `flolabs_users` (password hash stored on `flolabs_users.password`).
- On sign-in, `src/lib/auth.ts` populates `session.user` with fields from `flolabs_users` (`id`, `name`, `email`, `role`, `chronosUserId`, etc.).
- `session.user.id` and `session.user.chronosUserId` both reference `flolabs_users.id`.
- Use `chronosUserIdFromSessionUser()` to extract the Chronos user ID from a session.

### 3.2 API Routes
- All API code uses `flolabs_users.id` as the canonical identity key.
- Use helpers in `src/lib/permissions.ts` (`chronosActorDisplay`, `chronosEntryOwnerDisplayMap`, etc.) for identity resolution — do not scatter inline role checks.
- Use `applicantIdForSessionLinkedUser()` for cross-table queries that need the `flolabs_id` side.

### 3.3 Ownership on Time Entry Tables
- Canonical FK: `time_entries.flolabs_id` (→ `flolabs_users.id`).
- Compatibility FK: `time_entries.user_id` (→ `flolabs_users.id`, same value for unified rows).
- `whereTimeEntriesForLinkedUser(userId, applicantId)` queries by both for correct coverage.
- Same dual-column pattern applies to `tags`, `entry_discussions`, and `discussion_replies`.

### 3.4 Team Membership
- `team_memberships` stores the true many-to-many mapping via `user_id` (→ `flolabs_users.id`).
- `flolabs_users.team_id` stores a default/primary team pointer for compatibility.
- Teams sync (`/api/cron/teams-sync`) updates `team_memberships` from the Notion Team Member page's `Team` relation when `flolabs_users.notion_team_member_id` is set.

---

## 4. Data Governance Commitments

1. **`flolabs_users` is canonical.** `flolabs_users.id` is the source of truth for person identity. It is a shared table — both Chronos and Hephaestus read and write to it.
2. **No automatic merge.** Duplicate detection (`applicant_duplicate_reviews`) surfaces likely duplicates for HR review. No auto-merge is performed. Merges triggered from Hephaestus propagate to the shared Chronos tables in the same transaction.
3. **External IDs as foreign keys only.** Notion, HubSpot, and Discord IDs are stored for integration but are never used as primary join keys.
4. **Legacy columns deprecated, not deleted yet.** The `applicant_id` alias on several tables is deprecated; `flolabs_id` is the canonical column. Both are dual-written until the migration is fully committed.
5. **This document must be updated** whenever a structural change to the identity schema occurs.

---

## 5. Phase Summary

| Phase | Status | Summary |
|-------|--------|---------|
| Phase 1 | ✅ Complete | Duplicate detection contract defined; detection-only, no auto-merge |
| Phase 2 | ✅ Complete | `applicants` added as canonical identity; `session.user.id` = applicant id; `chronosUserId` bridge added |
| Phase 3 | ✅ Complete | All hot paths (timer, entries, reports, discussions, daily summary, settings) migrated to applicant-first resolution |
| Unification | ✅ Complete (2026-05) | `flolabs_users` single-table unification: Chronos and Hephaestus now share one physical `flolabs_users` table. No separate `applicants` table in production. `session.user.id` = `flolabs_users.id`. |
| Phase 4 | Future | Remove legacy `applicant_id` alias columns; clean up `flolabs_id` dual-write once all rows are confirmed backfilled |
