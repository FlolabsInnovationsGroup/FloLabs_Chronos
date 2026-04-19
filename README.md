# FloLabs Chronos

Internal time-tracking and team-management app for FloLabs.

## Core functionality

- Live timer tracking with Redis-backed active timers
- Team-scoped reporting
- Admin-managed projects
- Invite-only onboarding
- Admin team management
- Delayed tooltips for icon-only controls (3-second hover)
- Admin controls to disable or delete invitation links
- Admin ability to delete team members who have no time entries
- Confirmation modals for destructive actions, with **Cancel** as the highlighted option

## Local development

### Run with pnpm

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>

### Run locally in Docker

1. Copy `.env.local.docker.example` to `.env.local`
2. Fill in the real values, with no wrapping quotes around URLs or secrets
3. Build and start:

```powershell
docker compose -f docker-compose.local.yml up --build -d
```

4. Open <http://localhost:3000>
5. Stop when done:

```powershell
docker compose -f docker-compose.local.yml down
```

## Environment

Chronos reads from `.env.local` for local runs and `.env.production.local` for AWS deploy input.

Minimum local env requirements:
- `DATABASE_URL`
- `KV_URL` or `FL_KV_REDIS_URL`
- `AUTH_SECRET`
- `NEXTAUTH_URL`
- `APP_URL`
- `CRON_SECRET`

Important:
- do not wrap env values in quotes when using Docker locally
- App Runner deployment now rewrites the checked-in AWS runtime DB/Redis values into the deploy env source before publishing

## AWS deployment

Provision or refresh AWS infrastructure:

```powershell
pnpm aws:provision
```

Migrate data into AWS Postgres:

```powershell
pnpm aws:migrate-db
```

Deploy the current app image to AWS App Runner:

```powershell
pnpm aws:deploy
```

Current AWS target uses:
- App Runner for the web app
- RDS Postgres for primary data
- ElastiCache Serverless Redis for timers/pubsub
- ECR for container images

## Notes

- Registration is invite-only.
- Non-admin users are team-scoped.
- Member deletion is blocked if historical time entries exist; deactivate or preserve history instead.
