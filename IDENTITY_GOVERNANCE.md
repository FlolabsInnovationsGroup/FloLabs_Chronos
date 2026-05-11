# Chronos Data Model Governance & Canonical Identity Definition

**Version:** 1.0.0
**Date:** 2026-05-11
**Owner:** Oliver / FloLabs Engineering
**Status:** Current — reflects the implemented Phase 3 identity model.

---

## 1. Canonical Identity Principle

Every person in the FloLabs system has a single authoritative record: their **applicant row** (`applicants.id`). The Chronos `users` table is a **compatibility layer** that stores password hashes and anchors foreign keys for tables not yet migrated to the `applicants` identity.

**Session mapping:**
- `session.user.id` → `applicants.id` (canonical, used for all applicant-level lookups)
- `session.user.chronosUserId` → `users.id` (compatibility pointer, used for tables that still FK to `users`)

---

## 2. Defined Identifiers

### A. Applicant ID (The Canonical Identifier)

- **What it is:** The primary system-level identifier for any person tracked in FloLabs — internal member, admin, or candidate.
- **Table:** `applicants.id`
- **Format:** UUID v4
- **Immutability:** Never changes throughout the lifecycle of the person record.
- **Use case:** Auth session identity, all applicant-level data lookups, profile resolution, and canonical ownership for new code.
- **Alias columns:** Several tables have both `flolabs_id` (canonical, current name) and `applicant_id` (deprecated alias kept for migration compatibility). New code must write `flolabs_id`; the legacy `applicant_id` column exists only until the migration is complete.

### B. Chronos User ID (The Compatibility Layer)

- **What it is:** The `users.id` UUID. It anchors foreign keys on tables that predate the applicant identity model.
- **Table:** `users.id`
- **Lifecycle:** Persists as long as those legacy FKs exist. Will shrink in scope as FKs are migrated.
- **Use case:** Password hash storage, and as FK target for `time_entries.user_id`, `tags.user_id`, `team_memberships.user_id`, `entry_discussions.started_by_id`, `discussion_replies.author_id`, and similar legacy columns.
- **Resolution:** `applicants.chronos_user_id` → `users.id` is the bridge. Server routes that touch ownership or membership must use `chronosUserId` (or helpers built on it) when querying these legacy tables.

### C. External System IDs (Non-Canonical)

- **Examples:** Notion page IDs, HubSpot record IDs, Discord IDs.
- **Status:** Foreign keys and integration references only. Must not be used as primary join keys for identity-critical operations.
- **Pattern:** All external ID lookups pass through dedicated helpers or stored lookup columns (e.g. `applicants.notion_team_member_id`, `teams.notion_page_id`).

---

## 3. Identity Resolution Rules

### 3.1 Auth and Session
- NextAuth v5 credentials provider authenticates against `users` (password hash stored on `users`).
- On sign-in, `src/lib/auth.ts` resolves the linked `applicants` row and populates `session.user` with applicant-canonical fields (`id`, `name`, `email`, `role`, `chronosUserId`, etc.).
- All server routes use `session.user.chronosUserId` for ownership queries against legacy `users`-FK tables.

### 3.2 API Routes
- New API code must resolve ownership via `applicants.id` first, with `users.id` fallback for non-backfilled rows.
- Use helpers in `src/lib/permissions.ts` (`chronosActorDisplay`, `chronosEntryOwnerDisplayMap`, etc.) for identity resolution — do not scatter inline role checks.

### 3.3 Ownership on Time Entry Tables
- Preferred FK: `time_entries.flolabs_id` (applicant id).
- Compatibility FK: `time_entries.user_id` (chronos user id, still required for DB integrity).
- Same pattern applies to `tags`, `entry_discussions`, and `discussion_replies`.

### 3.4 Team Membership
- `team_memberships` stores the true many-to-many mapping via `user_id` (Chronos user id).
- `applicants.team_id` stores a default/primary team pointer for the canonical record.
- Teams sync (`/api/cron/teams-sync`) updates `team_memberships` from the Notion Team Member page's `Team` relation when `users.notion_team_member_id` is set.

---

## 4. Data Governance Commitments

1. **Applicant is canonical.** `applicants.id` is the source of truth for person identity. `users.id` is a compatibility artifact.
2. **No automatic merge.** Duplicate detection (`applicant_duplicate_reviews`) surfaces likely duplicates for HR review. No auto-merge is performed.
3. **External IDs as foreign keys only.** Notion, HubSpot, and Discord IDs are stored for integration but are never used as primary join keys.
4. **Legacy columns deprecated, not deleted yet.** The `applicant_id` alias on several tables is deprecated; `flolabs_id` is the canonical column. Both are dual-written until the migration is fully committed.
5. **This document must be updated** whenever a structural change to the identity schema occurs.

---

## 5. Phase Summary

| Phase | Status | Summary |
|-------|--------|---------|
| Phase 1 | ✅ Complete | Duplicate detection contract defined; detection-only, no auto-merge |
| Phase 2 | ✅ Complete | `applicants` added as canonical identity; `session.user.id` = applicant id; `chronosUserId` bridge added |
| Phase 3 | ✅ Complete | All hot paths (timer, entries, reports, discussions, daily summary, settings) migrated to applicant-first resolution with `users` fallback for non-backfilled rows |
| Phase 4 | Future | Remove legacy `applicant_id` alias columns; migrate remaining `users`-FK tables to `applicants`-FK |
