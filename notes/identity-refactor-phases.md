# Chronos identity refactor phases

Updated: 2026-04-21 Europe/Paris

## Goal

Move Chronos to a model where the leads/applicants database is the only identity source.
Chronos-specific persistence should remain only for app-specific operational data such as time entries, timers, tags, and related records.

## Phase plan

### Phase 1 — dependency map and stall detection
Status: in progress

Deliverables:
- enumerate all code and schema dependencies on the Chronos `users` table
- separate logical dependencies from hard schema or foreign-key dependencies
- define a repeatable way to detect when the refactor is stalled

Current findings from direct repo scan:
- `users` is still referenced across auth, permissions, many API routes, dashboard pages, reports, timer flows, tags, discussions, settings, importer scripts, and the schema itself
- `chronosUserId` is embedded in applicants-linked flows and scripts
- `userEmailAliases` and `findUserByAnyEmail` still anchor login and recovery to the Chronos `users` table
- hard schema references to `users` remain in `src/lib/db/schema.ts`

This means Phase 1 is not stalled from inactivity, but it is not complete yet because the dependency inventory has been surfaced but not yet grouped into:
1. immediately-switchable canonical-identity paths
2. compatibility paths requiring staged migration
3. hard blockers caused by foreign keys and ownership semantics

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
