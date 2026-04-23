# GitHub Actions AWS deploy bootstrap

This sets up Chronos for AWS-native deploys on every push to `main`.

## What it creates

- GitHub OIDC provider in AWS (`token.actions.githubusercontent.com`)
- IAM role: `flolabs-chronos-github-actions-deploy`
- inline IAM policy allowing:
  - ECR push / digest lookup
  - App Runner update / describe / list-operations
- GitHub repo secrets for the Chronos workflow

## Command

```powershell
powershell -ExecutionPolicy Bypass -File deploy/aws/setup-github-actions-deploy.ps1
```

## Inputs used

- `deploy/aws/provision-output.json`
- `.env.production.local` (fallback `.env.local`)

## GitHub secrets written

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

## Result

After this bootstrap succeeds, pushes to `main` can deploy Chronos without desktop Docker.
