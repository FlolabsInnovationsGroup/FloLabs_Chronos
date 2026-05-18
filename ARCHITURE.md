# Chronos — Architecture Quick Reference

> This file is a brief summary. The authoritative architecture document is **`ARCHITECTURE.md`**.
> Note: this filename has a typo (`ARCHITURE.md`). The canonical file is `ARCHITECTURE.md`.

## Production runtime

| Component | Service |
|-----------|---------|
| App server | Next.js 16 (App Router) on **AWS App Runner** (`us-east-1`) |
| Container registry | **Amazon ECR** — immutable `git-<sha>` tags |
| Transactional DB | **Neon serverless PostgreSQL** (`ep-broad-shadow-anqzuaqr.c-6.us-east-1.aws.neon.tech/neondb`) — shared with Hephaestus. URL from AWS SSM `/flolabs-chronos/DATABASE_URL`. The old AWS RDS (`flolabs-chronos-db`) was **deleted in 2026-05**. |
| Realtime / timers | **AWS ElastiCache Redis** (`KV_URL` / `FL_KV_REDIS_URL`) |
| Timer persistence | `src/lib/timer-recovery.ts` — restores active timer from DB when Redis is empty after deploy; auto-closes stale timers >24h |
| Auth | NextAuth.js v5 credentials; identity via `flolabs_users` (shared table) |
| Email | Resend (`RESEND_API_KEY`) |
| Ops integration | Notion API + Discord webhooks |

## Deploy path

`git push origin main` → GitHub Actions (`.github/workflows/deploy-aws-apprunner.yml`) → ECR → App Runner → verify `/api/health`.

Fallback (CodeBuild): `git archive` → S3 → `aws codebuild start-build --project-name flolabs-chronos-deploy`. See **`DEPLOYMENT.md`**.

## Service URL

- Default: `https://hcmsmnfq5q.us-east-1.awsapprunner.com`
- Custom domain: `https://athensgreecemarathon.com` (live, TLS active)

See **`DEPLOYMENT.md`** for the full deployment workflow and proof standard.
