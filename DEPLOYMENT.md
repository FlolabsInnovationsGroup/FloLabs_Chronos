# Chronos deployment workflow

This file describes the **current proven deployment method** for Chronos as of 2026-04-23.

## Status

**Proven working method:** GitHub Actions -> AWS OIDC -> ECR -> App Runner -> live verification on AWS.

Latest proven successful run:
- GitHub Actions run: `24829114875`
- Commit: `78e793e66f8e7e325a998f479ae00335e769cd94`
- Workflow: `.github/workflows/deploy-aws-apprunner.yml`

This run completed successfully and the live AWS surface verified:
- App Runner serving image tag `git-78e793e66f8e`
- `/api/health` returned matching commit/image metadata
- live forgot-password endpoint returned `200 {"ok":true}`

## The deployment rule

For Chronos, the normal deploy path must **not** depend on the local machine.

That means:
- no local Docker build for routine deploys
- no local browser or local app validation as deployment proof
- no local-machine runtime secrets as the source of truth for production deploys

The normal production deploy path is now fully AWS-native after initial bootstrap.

## Proven production deploy flow

1. Push to `main`
2. GitHub Actions starts `.github/workflows/deploy-aws-apprunner.yml`
3. The workflow assumes AWS credentials via GitHub OIDC
4. GitHub-hosted runners build the image with Docker Buildx
5. The workflow pushes immutable git-SHA image tags to ECR
6. The workflow reads runtime secrets from AWS SSM:
   - `/flolabs-chronos/DATABASE_URL`
   - `/flolabs-chronos/REDIS_URL`
   - `/flolabs-chronos/CRON_SECRET`
   - `/flolabs-chronos/RESEND_API_KEY`
   - `/flolabs-chronos/EMAIL_FROM`
   - optional canary reset-password test settings:
     - `/flolabs-chronos/RESET_PASSWORD_TEST_EMAIL`
     - `/flolabs-chronos/RESET_PASSWORD_TEST_SECRET`
7. The workflow updates the App Runner service to the exact pushed image
8. The workflow waits for App Runner to become idle before update
9. The workflow waits for the App Runner deployment operation to succeed
10. The workflow waits for the expected image identifier to become current
11. The workflow verifies `/api/health` returns the matching commit SHA
12. Post-deploy validation should check one real user-facing path on the live AWS surface when the change affects behavior

## Deployment proof standard

A deployment is only considered proven when all of the following are true:

1. GitHub Actions deploy run succeeded
2. App Runner is serving the expected git-SHA image
3. `/api/health` matches the deployed commit/image metadata
4. The relevant live production path is healthy

On 2026-04-23, the critical path used for proof was:
- `POST /api/auth/forgot-password`

## Reliable reset-password testing

A plain `200 {"ok":true}` from `POST /api/auth/forgot-password` is not enough to prove delivery.

Chronos now supports a safer canary test path for a dedicated reset-password test account:
- set optional SSM params `/flolabs-chronos/RESET_PASSWORD_TEST_EMAIL` and `/flolabs-chronos/RESET_PASSWORD_TEST_SECRET`
- trigger the live flow with header `x-reset-password-test-secret`
- the route will bypass cooldown **only for that configured canary email**, return the Resend email id plus reset token for testing, and log structured success/failure metadata to CloudWatch
- `pnpm run test:reset-password:live` then verifies:
  1. live forgot-password route works
  2. the token can be read back through `GET /api/auth/reset-password`
  3. Resend reports the message as `delivered`
  4. optionally, the script can complete `POST /api/auth/reset-password` if `RESET_PASSWORD_TEST_NEW_PASSWORD` is provided

Important:
- use a dedicated synthetic account for this canary path
- if email sending fails, Chronos now marks the just-created token used so failed sends do not poison the 2-hour cooldown window

## Files that define the deploy path

- `.github/workflows/deploy-aws-apprunner.yml`
- `deploy/aws/github-actions-inline-policy.json`
- `deploy/aws/github-actions-oidc-trust-policy.json`
- `deploy/aws/setup-github-actions-deploy.ps1`
- `deploy/aws/README-github-actions.md`

## AWS resources involved

- App Runner service: `flolabs-chronos`
- Service ARN: `arn:aws:apprunner:us-east-1:975049954782:service/flolabs-chronos/b6416d84200e4c5a9d884f8f4c134aaf`
- ECR repository: `flolabs-chronos`
- GitHub Actions deploy role: `arn:aws:iam::975049954782:role/flolabs-chronos-github-actions-deploy`
- App Runner ECR access role: `arn:aws:iam::975049954782:role/flolabs-chronos-apprunner-ecr-access-role`
- AWS region: `us-east-1`
- Service URL: `https://hcmsmnfq5q.us-east-1.awsapprunner.com`

## Runtime secret source of truth

Production runtime values for DB/Redis/cron/email are sourced from AWS SSM during deploy, not from GitHub secrets and not from checked-in env files.

Current SSM parameters used by the workflow:
- `/flolabs-chronos/DATABASE_URL`
- `/flolabs-chronos/REDIS_URL`
- `/flolabs-chronos/CRON_SECRET`
- `/flolabs-chronos/RESEND_API_KEY`
- `/flolabs-chronos/EMAIL_FROM`
- optional:
  - `/flolabs-chronos/RESET_PASSWORD_TEST_EMAIL`
  - `/flolabs-chronos/RESET_PASSWORD_TEST_SECRET`

GitHub secrets are still used for the remaining application secrets such as:
- `AUTH_SECRET`
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`
- `NOTION_ONBOARDINGS_DB_ID`
- `NOTION_TASKS_DB_ID`
- `NOTION_TEAMS_DB_ID`
- `NOTION_TEAM_MEMBERS_DB_ID`

## Bootstrap vs normal operation

### One-time / infrequent bootstrap

These steps may still use a trusted operator machine to establish AWS/GitHub wiring:
- `deploy/aws/provision.ps1`
- `deploy/aws/setup-github-actions-deploy.ps1`

Those are **bootstrap/infra setup** steps, not the routine deploy loop.

### Normal deployment

Routine deploys must use only:
- Git push to `main`
- GitHub Actions
- AWS OIDC
- ECR
- App Runner
- AWS SSM
- live AWS verification

## What is no longer the normal method

These are not the standard production workflow anymore:
- `pnpm aws:deploy`
- `deploy/aws/deploy-app.ps1`
- any local Docker-based deploy as the default path

They may exist as legacy/emergency operator tools, but they are **not** the proven primary workflow.

## Known lessons from 2026-04-23

The working deployment flow was hardened through several real failures:

1. GitHub Actions AWS auth initially failed until the OIDC role wiring was fixed
2. App Runner update initially failed due to missing `iam:PassRole`
3. The workflow initially raced App Runner and needed explicit idle/wait logic
4. Runtime DB config initially failed when sourced from the wrong place; SSM became the source of truth
5. The production DB TLS path required normalizing `sslmode=require` handling for `pg`

## Next-session checklist

When resuming deployment work in a future session, use this exact order:

1. Check latest Actions runs:
   - `gh run list --repo FlomadLabsRD/FloLabs_Chronos --limit 5`
2. Check App Runner live image/status:
   - `aws apprunner describe-service ...`
3. Check live health metadata:
   - `GET https://hcmsmnfq5q.us-east-1.awsapprunner.com/api/health`
4. Check the relevant live user path for the change
5. Only if bootstrap wiring is broken, use the bootstrap scripts
6. Do not fall back to local-machine deployment unless explicitly handling an emergency and documenting why

## Current conclusion

As of the proven run on 2026-04-23, the deployment workflow that should be reused in future sessions is:

**push to `main` -> GitHub Actions builds and deploys on AWS -> verify App Runner image -> verify `/api/health` -> verify the affected live AWS endpoint**
