# Chronos Hetzner Migration Strategy

## Goal

Move Chronos off the currently-charging AWS runtime onto the existing Hetzner + Plesk server, while keeping Chronos isolated from the other hosted domains and avoiding dependency on Neon recovery.

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

- Historical data: reconstruct from Notion export
- Identity linkage: Team Member relation -> `users.notion_team_member_id`
- Live delta: reconcile from the current production DB if needed
- Neon: no longer part of the plan

## Minimum acceptance criteria

Chronos can be considered migrated when:
- app is reachable through the Plesk-managed domain
- login works
- local Postgres and Redis are healthy
- historical data import completed or is resumably in progress
- key pages load without AWS dependencies
- backup procedure is documented and runnable
