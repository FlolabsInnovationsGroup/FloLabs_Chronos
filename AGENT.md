# AGENT.md — Coding Agent Orchestration for Chronos

This file tells delegated coding agents how to work in this repository.

## Mission

Finish Chronos safely and quickly, with AWS as the only authoritative validation environment.

## Architecture snapshot (read `ARCHITECTURE.md` for the full contract)

Chronos is a **Next.js 16 App Router** app whose **production** deployment is:

- **AWS App Runner** (container) in **`us-east-1`**, fed by **Amazon ECR** images built in **GitHub Actions** on pushes to **`main`** (workflow: `.github/workflows/deploy-aws-apprunner.yml`).
- **Neon serverless PostgreSQL** (`ep-broad-shadow-anqzuaqr.c-6.us-east-1.aws.neon.tech/neondb`) for all relational data (Drizzle ORM). Shared with Hephaestus International. URL injected from AWS SSM `/flolabs-chronos/DATABASE_URL`. **Note:** The old AWS RDS instance (`flolabs-chronos-db`) was deleted in 2026-05 — any references to it in old scripts are stale artifacts.
- **AWS ElastiCache Serverless Redis** for timers, pub/sub, and SSE-related state (`KV_URL` / `FL_KV_REDIS_URL`).
- **Secrets:** runtime DB/Redis/cron/email from **AWS SSM** under `/flolabs-chronos/*`; app secrets (e.g. `AUTH_SECRET`, Notion keys) from **GitHub Actions secrets** at deploy time — see `DEPLOYMENT.md`.
- **Auth:** NextAuth v5 **credentials**; canonical identity is **`flolabs_users`** (single shared table with Hephaestus). `session.user.id` and `session.user.chronosUserId` both reference `flolabs_users.id`. No separate `applicants` table in the current production schema. See `src/lib/auth.ts`.
- **Timer persistence:** `src/lib/timer-recovery.ts` — `restoreTimerFromDb()` restores active timer from PostgreSQL `time_entries` (`stoppedAt IS NULL`) when Redis is empty after a deploy. Stale timers >24h old are auto-closed. Called by GET `/api/timer/active` and POST `/api/timer/stop` on Redis miss.
- **Integrations:** Notion (mirror/sync), Discord (webhooks), Resend (password-reset mail).
- **Default public service URL:** `https://hcmsmnfq5q.us-east-1.awsapprunner.com` — use **`GET /api/health`** to confirm the running **`commitSha`** matches your change after deploy.

**Not production:** Vercel is a legacy reference only (DNS history). Hetzner+Plesk is described in `deploy/hetzner-migration-strategy.md` as a possible future direction, not live AWS.

## Required Read Order

1. `ARCHITECTURE.md` — especially **“System architecture (for agents)”**, then product and data rules
2. `DEPLOYMENT.md` — production deploy and SSM/GitHub split
3. `GAME_MASTER.md` — what is done vs in flight
4. `CLAUDE.md` — validation rules and credentials context
5. Then inspect the relevant code

## Non-Negotiable Rules

- Never test Chronos behavior on the local machine.
- Never create or rely on a local test environment for Chronos validation.
- Never use local Docker, local browser testing, local app runs, or host-local smoke tests as evidence that a change works.
- Validate only through AWS / deployed surfaces:
  - App Runner
  - Lambda
  - EventBridge
  - CloudWatch
  - public deployment URLs
  - other AWS-reachable interfaces
- If AWS-only validation is blocked, report the blocker clearly instead of falling back to local testing.

## Identity Model (Current)

The identity model uses a **single shared table**: `flolabs_users` (mapped in Drizzle as `users`). There is no separate `applicants` table in the current production schema — the `flolabs_users` unification is complete and shipped.

- `session.user.id` and `session.user.chronosUserId` both reference `flolabs_users.id`.
- The `flolabs_id` / `applicant_id` dual-write columns on `time_entries`, `tags`, and discussion tables are legacy artifacts from the pre-unification identity refactor; they point to rows in `flolabs_users` (not a separate applicants table).
- `chronosUserIdFromSessionUser()` — resolves Chronos user ID from session.
- `applicantIdForSessionLinkedUser()` — resolves the `flolabs_users` applicant-side ID for cross-table queries.
- `whereTimeEntriesForLinkedUser(userId, applicantId)` — queries `time_entries` by both `user_id` AND `flolabs_id` for correct ownership resolution.

## Code Change Rules

- Favor applicant-canonical identity over legacy `users`-only assumptions.
- Use compatibility fallbacks only where needed for non-backfilled rows.
- Update `GAME_MASTER.md` and relevant notes when completing a meaningful slice.
- Commit and push coherent changes unless explicitly told not to.
- Avoid unrelated workspace noise in commits.

## Validation Rules

Minimum acceptable validation for a code slice:
- run the smallest meaningful static gate available (for example TypeScript)
- then use AWS/deployed-surface validation when behavior claims matter

Do not claim production readiness without deployed proof.

## If You Get Stuck

Report:
- the concrete blocker
- what AWS-side validation path was attempted
- the smallest next step to unblock progress
