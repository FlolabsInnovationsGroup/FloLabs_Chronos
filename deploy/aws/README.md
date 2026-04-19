# Chronos AWS deploy notes

## Commands

```powershell
pnpm aws:provision
pnpm aws:migrate-db
pnpm aws:deploy
```

## Runtime env philosophy

Like `Emails_automation`, the App Runner deploy reads the checked-in local env file (`.env.production.local`, then `.env.local`) and applies the full runtime environment at deploy time, with AWS-only overrides for:

- `DATABASE_URL`
- `FL_CHRONOS_DATABASE_URL`
- `FL_CHRONOS_DATABASE_URL_UNPOOLED`
- `KV_URL`
- `FL_KV_REDIS_URL`
- `CRON_SECRET`
- `NODE_ENV`
- `NEXTAUTH_URL`
- `APP_URL`

Vercel-only metadata variables are filtered out before deploy.

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
