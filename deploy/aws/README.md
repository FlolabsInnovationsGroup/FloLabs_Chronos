# Chronos AWS deploy notes

## Commands

```powershell
pnpm aws:provision
pnpm aws:migrate-db
pnpm aws:deploy
```

## Current role of these commands

- `pnpm aws:provision` is an infrastructure/bootstrap command
- `pnpm aws:migrate-db` is a one-off or operational database migration command
- `pnpm aws:deploy` is now a **legacy/emergency operator fallback**, not the standard production workflow

## Runtime env philosophy

The proven routine deploy path no longer depends on checked-in local env files as the production runtime source of truth.

Current proven production behavior:
- GitHub Actions builds the image
- AWS SSM provides runtime `DATABASE_URL`, `REDIS_URL`, and `CRON_SECRET`
- App Runner receives the rendered runtime env during deploy

Checked-in env files may still exist for bootstrap/operator continuity, but they are not the preferred source of truth for routine production deploys.

## AWS-native replacements

The AWS provision step now creates:
- RDS Postgres for the main database
- ElastiCache Serverless Redis for active timers / pubsub replacement of Vercel KV

This means Neon and Vercel KV can both be treated as legacy infrastructure once the app is healthy on AWS.

## Cron replacement path

Vercel `vercel.json` cron entries do not migrate 1:1 to App Runner. App Runner has no native scheduled HTTP trigger, so the AWS replacement should be:

1. Create a tiny Lambda "cron-dispatcher".
2. Give it the Chronos App Runner base URL and `CRON_SECRET`.
3. Create three EventBridge schedules that invoke the Lambda for:
   - `/api/cron/notion-sync` every 5 minutes
   - `/api/cron/teams-sync` every 15 minutes
   - `/api/cron/daily-summary` at 17:00 UTC daily

That keeps the current authenticated HTTP cron contract intact without changing app logic.
