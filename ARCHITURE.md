# Chronos — Architecture Quick Reference

> This file is a brief summary. The authoritative architecture document is **`ARCHITECTURE.md`**.

## Production runtime

| Component | Service |
|-----------|---------|
| App server | Next.js 16 (App Router) on **AWS App Runner** (`us-east-1`) |
| Container registry | **Amazon ECR** — immutable `git-<sha>` tags |
| Transactional DB | **AWS RDS PostgreSQL** |
| Realtime / timers | **AWS ElastiCache Redis** |
| Auth | NextAuth.js v5 credentials |
| Email | Resend (`RESEND_API_KEY`) |
| Ops integration | Notion API + Discord webhooks |

## Deploy path

`git push origin main` → GitHub Actions (`.github/workflows/deploy-aws-apprunner.yml`) → ECR → App Runner → verify `/api/health`.

## Service URL

- Default: `https://hcmsmnfq5q.us-east-1.awsapprunner.com`
- Custom domain: `athensgreecemarathon.com`

See **`DEPLOYMENT.md`** for the full deployment workflow and proof standard.
