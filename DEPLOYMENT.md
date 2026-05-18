# Chronos deployment workflow

This file describes the **current proven deployment method** for Chronos.

**Architecture context:** For the full system picture (App Runner, RDS, Redis, auth, integrations), read **`ARCHITECTURE.md`** → section **“System architecture (for agents)”**. This file focuses on **how** that stack is released and verified.

## Status

**Proven working method (2026-05):** AWS CodeBuild → ECR → App Runner → live `/api/health` verification.

**Fallback when GitHub Actions billing is available:** push to `main` runs `.github/workflows/deploy-aws-apprunner.yml` (same ECR/App Runner outcome).

## The deployment rule

For Chronos, the normal deploy path must **not** depend on the local machine for runtime proof.

That means:

- no local Docker build as deployment proof
- no local browser or local app validation as deployment proof
- production runtime secrets come from **AWS SSM**, not checked-in env files

Operators may still zip source and start CodeBuild from a workstation; the **build and release** run entirely in AWS.

## Primary deploy flow — AWS CodeBuild

| Item | Value |
|---|---|
| CodeBuild project | `flolabs-chronos-deploy` |
| Build spec | `buildspec.yml` (repo root) |
| Source bucket | `s3://flolabs-hephaestus-codebuild/chronos-source.zip` |
| IAM role | `arn:aws:iam::975049954782:role/hephaestus-international-codebuild` |
| ECR repository | `flolabs-chronos` |
| Image tag | `git-<12-char-sha>` |
| App Runner service | `flolabs-chronos` |
| Service ARN | `arn:aws:apprunner:us-east-1:975049954782:service/flolabs-chronos/b6416d84200e4c5a9d884f8f4c134aaf` |
| AWS URL | `https://hcmsmnfq5q.us-east-1.awsapprunner.com` |
| Production domain | `https://athensgreecemarathon.com` |
| Region / account | `us-east-1` / `975049954782` |

### Steps

1. From a clean `FloLabs_Chronos` tree, create a source archive (exclude `.git`, `node_modules`, `.next`):

```powershell
cd FloLabs_Chronos
git archive -o chronos-source.zip HEAD
# Or, if you have uncommitted fixes to ship:
# Compress-Archive -Path * -DestinationPath chronos-source.zip  # after excluding heavy dirs manually
```

2. Upload the zip (overwrites the CodeBuild source object):

```bash
aws s3 cp chronos-source.zip s3://flolabs-hephaestus-codebuild/chronos-source.zip --region us-east-1
```

3. Start the build (optional `GIT_SHA` override when the zip is not a git checkout):

```bash
aws codebuild start-build \
  --project-name flolabs-chronos-deploy \
  --region us-east-1 \
  --environment-variables-override name=GIT_SHA,value=$(git rev-parse HEAD),type=PLAINTEXT
```

4. Wait for CodeBuild `SUCCEEDED`. The `post_build` phase updates App Runner and curls `/api/health` until `"ok":true` and `"commitSha"` match.

5. Validate the affected live user path on `https://athensgreecemarathon.com` (or the AWS URL above).

### What CodeBuild does

1. Logs in to ECR and reads runtime secrets from SSM (`/flolabs-chronos/*`)
2. Preserves Notion/GitHub-only env vars from the current App Runner service when needed
3. Builds the Docker image with immutable `git-<sha>` tags
4. Pushes to ECR
5. Waits for App Runner idle, updates the service (VPC connector + `flolabs-apps` auto-scaling)
6. Verifies `/api/health`

Project definition: `infra/codebuild-project.json`. IAM extras: `infra/codebuild-chronos-policy.json`.

## Fallback deploy flow — GitHub Actions

1. Push to `main`
2. Workflow `.github/workflows/deploy-aws-apprunner.yml` assumes OIDC, builds on GitHub-hosted runners, pushes ECR, updates App Runner, verifies health

Use this when Actions minutes are available; behavior matches CodeBuild.

## Runtime secret source of truth

Production values are read from **AWS SSM** during deploy (CodeBuild `pre_build` or GHA workflow):

| SSM parameter | Runtime env var |
|---|---|
| `/flolabs-chronos/DATABASE_URL` | `DATABASE_URL`, `FL_CHRONOS_DATABASE_URL`, … |
| `/flolabs-chronos/REDIS_URL` | `KV_URL`, `FL_KV_REDIS_URL` |
| `/flolabs-chronos/CRON_SECRET` | `CRON_SECRET` |
| `/flolabs-chronos/RESEND_API_KEY` | `RESEND_API_KEY` |
| `/flolabs-chronos/EMAIL_FROM` | `EMAIL_FROM` (falls back to `INVITE_FROM_EMAIL` in GHA path) |
| `/flolabs-chronos/NOTION_API_KEY` | `NOTION_API_KEY` (CodeBuild) |
| optional | `/flolabs-chronos/RESET_PASSWORD_TEST_EMAIL`, `RESET_PASSWORD_TEST_SECRET` |

From **GitHub Actions secrets** (GHA path only, or copied forward on App Runner): `AUTH_SECRET`, `NOTION_DATABASE_ID`, `NOTION_ONBOARDINGS_DB_ID`, `NOTION_TASKS_DB_ID`, `NOTION_TEAMS_DB_ID`, `NOTION_TEAM_MEMBERS_DB_ID`.

## Deployment proof standard

A deployment is proven when all of the following are true:

1. CodeBuild (or GitHub Actions) completed successfully
2. App Runner serves the expected `git-<sha>` image
3. `GET /api/health` returns `"ok":true` with matching `commitSha`
4. The relevant live production path works

## What is no longer the normal method

These are legacy / emergency operator tools, not the default loop:

- `pnpm aws:deploy` / `deploy/aws/deploy-app.ps1`
- Local Docker-based production deploys

Bootstrap (one-time): `deploy/aws/provision.ps1`, `deploy/aws/setup-github-actions-deploy.ps1`.

## Shared applicant status (`flolabs_users.status`)

- Chronos **displays** pipeline status read-only on **Users → Edit**; Hephaestus HR **owns** edits (including `graduated`, `terminated`, and permanent delete).
- After a status deploy, verify on production: HR changes a test lead status → Chronos Users edit modal shows the same label; `graduated`/`terminated` users cannot sign in and drop off the Users directory.
- Automated checks: `e2e/applicant-status-readonly.spec.ts` (requires `E2E_EMAIL` / `E2E_PASSWORD` admin or HR).

## How to validate a deploy

```bash
aws codebuild list-builds-for-project --project-name flolabs-chronos-deploy --region us-east-1 --max-items 3

aws apprunner describe-service \
  --service-arn arn:aws:apprunner:us-east-1:975049954782:service/flolabs-chronos/b6416d84200e4c5a9d884f8f4c134aaf \
  --region us-east-1 \
  --query 'Service.{Status:Status,ImageId:SourceConfiguration.ImageRepository.ImageIdentifier}'

curl -s https://hcmsmnfq5q.us-east-1.awsapprunner.com/api/health | python3 -m json.tool
```

## Current conclusion

**Package source → S3 → CodeBuild (`flolabs-chronos-deploy`) → ECR → App Runner → verify `/api/health` → verify live user path.**

Use GitHub Actions on `main` when available; it targets the same AWS resources.
