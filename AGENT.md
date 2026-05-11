# AGENT.md — Coding Agent Orchestration for Chronos

This file tells delegated coding agents how to work in this repository.

## Mission

Finish Chronos safely and quickly, with AWS as the only authoritative validation environment.

## Architecture snapshot (read `ARCHITECTURE.md` for the full contract)

Chronos is a **Next.js 16 App Router** app whose **production** deployment is:

- **AWS App Runner** (container) in **`us-east-1`**, fed by **Amazon ECR** images built in **GitHub Actions** on pushes to **`main`** (workflow: `.github/workflows/deploy-aws-apprunner.yml`).
- **AWS RDS PostgreSQL** for all relational data (Drizzle ORM).
- **AWS ElastiCache Serverless Redis** for timers, pub/sub, and SSE-related state (`KV_URL` / `FL_KV_REDIS_URL`).
- **Secrets:** runtime DB/Redis/cron/email from **AWS SSM** under `/flolabs-chronos/*`; app secrets (e.g. `AUTH_SECRET`, Notion keys) from **GitHub Actions secrets** at deploy time — see `DEPLOYMENT.md`.
- **Auth:** NextAuth v5 **credentials**; canonical identity is **`applicants`** with **`chronosUserId`** pointing at **`users`** (password hash). See `src/lib/auth.ts`.
- **Integrations:** Notion (mirror/sync), Discord (webhooks), Resend (password-reset mail).
- **Default public service URL:** `https://hcmsmnfq5q.us-east-1.awsapprunner.com` — use **`GET /api/health`** to confirm the running **`commitSha`** matches your change after deploy.

**Not production:** Vercel and Neon are **historical**; docs may mention them only as legacy. **Future** self-host on Hetzner+Plesk is described in `ARCHITECTURE.md` as a possible direction, not live AWS.

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

## Refactor Priority

The identity refactor (Phases 1–3) is **complete**. `applicants` is the canonical identity layer; `users` is the compatibility layer for password hashes and legacy FK targets. Session fields: `session.user.id` = applicant id, `session.user.chronosUserId` = `users.id`.

When working on any remaining identity cleanup:
- Prefer small, coherent, high-leverage slices.
- New code should prefer applicant-first resolution with `users` fallback for non-backfilled rows.
- The legacy `applicant_id` column naming on several tables is deprecated; `flolabs_id` is the canonical alias.

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
