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
The canonical production target is AWS RDS Postgres plus AWS Redis, not Neon.

Minimum local env requirements:
- `DATABASE_URL`
- `KV_URL` or `FL_KV_REDIS_URL`
- `AUTH_SECRET`
- `NEXTAUTH_URL`
- `APP_URL`
- `CRON_SECRET`

Important:
- do not wrap env values in quotes when using Docker locally
- remove old provider-specific fallback vars from production env files when standardizing an environment
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

Manual fallback deploy from a trusted operator machine:

```powershell
pnpm aws:deploy
```

Preferred production path: **GitHub Actions deploys automatically on every push to `main`** using AWS OIDC, ECR, and App Runner.

Current AWS target uses:
- App Runner for the web app
- RDS Postgres for primary data
- ElastiCache Serverless Redis for timers/pubsub
- ECR for container images
- GitHub Actions for AWS-native image build + deploy on `main`

### GitHub Actions AWS-native deploy setup

Workflow file:
- `.github/workflows/deploy-aws-apprunner.yml`

Required GitHub secrets:
- `AWS_GITHUB_ACTIONS_ROLE_ARN`
- `AUTH_SECRET`
- `CRON_SECRET`
- `DATABASE_URL`
- `FL_KV_REDIS_URL`
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`
- `NOTION_ONBOARDINGS_DB_ID`
- `NOTION_TASKS_DB_ID`
- `NOTION_TEAMS_DB_ID`
- `NOTION_TEAM_MEMBERS_DB_ID`
- `RESEND_API_KEY`
- `EMAIL_FROM`

The workflow:
1. assumes AWS credentials via GitHub OIDC
2. builds and pushes an immutable git-SHA image to ECR
3. updates App Runner to that exact image
4. verifies `/api/health` returns the pushed commit SHA

This is the intended long-term deployment path so Chronos deploys no longer depend on desktop Docker.

## Notes

- Registration is invite-only.
- Non-admin users are team-scoped.
- Member deletion is blocked if historical time entries exist; deactivate or preserve history instead.
