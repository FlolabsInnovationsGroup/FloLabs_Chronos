# FloLabs Chronos

Internal time-tracking and team-management app for FloLabs.

## Documentation map (for humans and coding agents)

| Doc | Purpose |
|-----|---------|
| **`ARCHITECTURE.md`** | **Start here.** Product model, identity (`flolabs_users`), data rules, timers, Notion — plus **”System architecture (for agents)”** (AWS App Runner, RDS PostgreSQL, Redis, deploy/secret layout). |
| **`DEPLOYMENT.md`** | Proven path: CodeBuild → ECR → App Runner; SSM parameters; post-deploy checks. |
| **`AGENT.md`** | Agent workflow: AWS-only validation, read order, priorities. |
| **`CLAUDE.md`** | Maintainer/agent guardrails, credentials context, theme rules. |
| **`GAME_MASTER.md`** | Implementation tracker and changelog-style notes. |

Production runtime is **AWS** (App Runner + **RDS PostgreSQL** + ElastiCache).

Chronos shares a single **`flolabs_users`** identity table and the same **RDS** database with Hephaestus International (`DATABASE_URL` injected from AWS SSM `/flolabs-chronos/DATABASE_URL`).

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
The canonical production target is **Neon serverless PostgreSQL** (`ep-broad-shadow-anqzuaqr.c-6.us-east-1.aws.neon.tech/neondb`) plus **AWS ElastiCache Redis**. The old AWS RDS instance (`flolabs-chronos-db`) was deleted in 2026-05 and should not be referenced.

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

Legacy/emergency-only operator fallback (not the normal method):

```powershell
pnpm aws:deploy
```

Preferred and proven production path: **GitHub Actions deploys automatically on every push to `main`** using AWS OIDC, ECR, AWS SSM runtime secrets, ECR, and App Runner.

Current AWS target uses:
- App Runner for the web app
- **Neon serverless PostgreSQL** for primary data (shared with Hephaestus)
- ElastiCache Serverless Redis for timers/pubsub
- ECR for container images
- GitHub Actions for AWS-native image build + deploy on `main`

### GitHub Actions AWS-native deploy setup

Workflow file:
- `.github/workflows/deploy-aws-apprunner.yml`

**GitHub Actions secrets** (see `.github/workflows/deploy-aws-apprunner.yml`): `AUTH_SECRET`, `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `NOTION_ONBOARDINGS_DB_ID`, `NOTION_TASKS_DB_ID`, `NOTION_TEAMS_DB_ID`, `NOTION_TEAM_MEMBERS_DB_ID`.

**AWS SSM parameters** (read at deploy, injected as `DATABASE_URL`, `KV_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, etc.): under `/flolabs-chronos/*` — full list in **`DEPLOYMENT.md`**.

The workflow:
1. assumes AWS credentials via GitHub OIDC
2. builds and pushes an immutable git-SHA image to ECR
3. reads DB/Redis/cron/email runtime values from AWS SSM
4. updates App Runner to that exact image
5. waits for the deployment to settle and verifies `/api/health` returns the pushed commit SHA

Optional canary reset-password runtime settings can also be sourced from SSM:
- `RESET_PASSWORD_TEST_EMAIL`
- `RESET_PASSWORD_TEST_SECRET`

Bootstrap the AWS/GitHub integration with:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/aws/setup-github-actions-deploy.ps1
```

See also:
- `deploy/aws/README-github-actions.md`

This is the proven deployment path so routine Chronos deploys no longer depend on desktop Docker or local-machine runtime inputs.

For the full proven method, see `DEPLOYMENT.md`.

### Live reset-password verification

For a reliable production check of the reset-password flow, use a dedicated canary account and run:

```powershell
pnpm run test:reset-password:live
```

Expected env inputs:
- `CHRONOS_BASE_URL` (or `NEXTAUTH_URL`)
- `RESET_PASSWORD_TEST_EMAIL`
- `RESET_PASSWORD_TEST_SECRET`
- `RESEND_API_KEY`
- optional: `RESET_PASSWORD_TEST_NEW_PASSWORD`

This probes the live forgot-password route, checks the live reset-token read path, and verifies the Resend message reaches `delivered`.

## Notes

- Registration is invite-only.
- Non-admin users are team-scoped.
- Member deletion is blocked if historical time entries exist; deactivate or preserve history instead.
