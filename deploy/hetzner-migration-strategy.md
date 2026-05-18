# Chronos Hetzner Migration Strategy

> **Status as of 2026-05-18: ASPIRATIONAL / NOT CURRENT PRODUCTION**
>
> This document describes a possible future direction for self-hosting Chronos on Hetzner + Plesk. It is **not** the current production setup.
>
> **Current production (2026-05-18):**
> - App server: AWS App Runner (`flolabs-chronos`, `us-east-1`)
> - Database: **Neon serverless PostgreSQL** (`ep-broad-shadow-anqzuaqr.c-6.us-east-1.aws.neon.tech/neondb`) — shared with Hephaestus International. The old AWS RDS (`flolabs-chronos-db`) was deleted in 2026-05.
> - Redis: AWS ElastiCache
> - Deploy: GitHub Actions → ECR → App Runner (see `DEPLOYMENT.md`)
>
> If a Hetzner migration is ever re-evaluated, update this document and the infra section of `ARCHITECTURE.md` before treating anything here as operational guidance.

## Goal

Move Chronos off the AWS runtime onto the existing Hetzner + Plesk server, while keeping Chronos isolated from the other hosted domains.

## Target runtime

- Plesk manages domain, TLS, and reverse-proxy ingress
- Chronos runs as an isolated host-level app service on an internal port
- Chronos uses its own local Postgres database
- Chronos uses its own local Redis instance or Redis database namespace
- Chronos backup procedures are explicit and separate from other hosted sites

## Migration phases

### Phase 1: Bring up the Hetzner runtime

1. Install Chronos runtime dependencies on the Hetzner host
   - Node.js runtime
   - PostgreSQL
   - Redis
2. Create isolated Chronos service user, app directory, env file, and systemd unit
3. Start Chronos on an internal port
4. Configure Plesk domain/subdomain reverse proxy to forward to that internal port
5. Verify:
   - login page loads
   - auth works
   - app can reach local Postgres and Redis
   - Notion sync credentials load correctly

### Phase 2: Establish data safety before cutover

1. Export current production DB state from the active runtime, if reachable
2. Keep a local dump of the Hetzner Chronos Postgres before historical import
3. Keep the Notion CSV export as the historical recovery artifact in Hermes

### Phase 3: Historical reconstruction

Source of truth for historical reconstruction:
- exported Notion Time Entries CSV
- Team Member linkage from the Notion Team Members database relation

Rules:
- do not rely on Neon backup/export
- map each imported user through `users.notion_team_member_id`
- use Notion `Entry ID` as `time_entries.notion_page_id` for idempotency
- import in resumable batches
- verify counts by user/project after completion

### Phase 4: Live-state reconciliation

After historical import succeeds:
1. Compare current AWS production counts versus Hetzner counts
2. Decide whether newer live entries must be copied over from AWS
3. Run a delta import if needed
4. Re-verify auth, timer flows, reports, and Notion sync

### Phase 5: Cutover

1. Point Chronos domain/subdomain in Plesk to the Hetzner runtime
2. Freeze writes on the old environment if necessary
3. Run final smoke tests
4. Monitor errors and resource usage
5. Only after confidence, decommission AWS services causing ongoing cost

## Data strategy summary

- Historical data: reconstruct from Notion export, or export from current Neon database
- Identity linkage: Team Member relation -> `flolabs_users.notion_team_member_id`
- Live delta: reconcile from the current Neon production DB — 96 users + 17,459 entries as of 2026-05-18
- **Database note:** As of 2026-05, production uses **Neon serverless PostgreSQL** (not AWS RDS, which was deleted). A Hetzner migration would require either migrating from Neon or standing up a local Postgres and importing the Neon dump.

## Minimum acceptance criteria

Chronos can be considered migrated when:
- app is reachable through the Plesk-managed domain
- login works
- local Postgres and Redis are healthy
- historical data import completed or is resumably in progress
- key pages load without AWS dependencies
- backup procedure is documented and runnable
