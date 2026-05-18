# Chronos deployment workflow

This file describes the **current proven deployment method** for Chronos.

**Architecture context:** For the full system picture (App Runner, RDS, Redis, auth, integrations), read **`ARCHITECTURE.md`** → section **“System architecture (for agents)”**. This file focuses on **how** that stack is released and verified.

## Status

**Deploy method:** AWS CodeBuild → ECR → App Runner → live `/api/health` verification.

## The deployment rule

For Chronos, the normal deploy path must **not** depend on the local machine for runtime proof.

That means:

- no local Docker build as deployment proof
- no local browser or local app validation as deployment proof
- production runtime secrets come from **AWS SSM**, not checked-in env files

Operators may still zip source and start CodeBuild from a workstation; the **build and release** run entirely in AWS.

## Deploy flow — AWS CodeBuild

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

1. From the `FloLabs_Chronos` repo root, create a source archive **with files at the root of the zip** (not nested under a directory). `git archive` handles this automatically; when uncommitted changes exist, use the PowerShell snippet below:

```powershell
# Preferred: git archive (files at root, respects .gitignore, includes buildspec.yml)
git archive -o chronos-source.zip HEAD

# If you need to include uncommitted changes:
# Run from INSIDE the FloLabs_Chronos directory, NOT its parent:
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = Get-Location   # must be the repo root
$dest = Join-Path $src "chronos-source.zip"
if (Test-Path $dest) { Remove-Item $dest }
$zip = [System.IO.Compression.ZipFile]::Open($dest, 'Create')
$excludes = @('.git','node_modules','.next','chronos-source.zip')
Get-ChildItem -Path $src -Recurse -File | Where-Object {
  $rel = $_.FullName.Substring($src.Path.Length + 1)
  -not ($rel.Split([IO.Path]::DirectorySeparatorChar) | Where-Object { $excludes -contains $_ })
} | ForEach-Object {
  $entry = $_.FullName.Substring($src.Path.Length + 1).Replace('\','/')
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entry) | Out-Null
}
$zip.Dispose()
```

> **Critical**: `Compress-Archive -Path . -DestinationPath ...` nests files under a directory and breaks CodeBuild. Use the snippet above or `git archive` instead.

2. Upload the zip (overwrites the CodeBuild source object):

```bash
aws s3 cp chronos-source.zip s3://flolabs-hephaestus-codebuild/chronos-source.zip --region us-east-1
```

3. Start the build. **Always pass `GIT_SHA`** — CodeBuild S3 sources have no git context so `CODEBUILD_RESOLVED_SOURCE_VERSION` is empty without it:

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

## Runtime secret source of truth

Production values are read from **AWS SSM** during CodeBuild `pre_build`:

| SSM parameter | Runtime env var |
|---|---|
| `/flolabs-chronos/DATABASE_URL` | `DATABASE_URL`, `FL_CHRONOS_DATABASE_URL`, … |
| `/flolabs-chronos/REDIS_URL` | `KV_URL`, `FL_KV_REDIS_URL` |
| `/flolabs-chronos/CRON_SECRET` | `CRON_SECRET` |
| `/flolabs-chronos/RESEND_API_KEY` | `RESEND_API_KEY` |
| `/flolabs-chronos/EMAIL_FROM` | `EMAIL_FROM` |
| `/flolabs-chronos/NOTION_API_KEY` | `NOTION_API_KEY` |
| optional | `/flolabs-chronos/RESET_PASSWORD_TEST_EMAIL`, `RESET_PASSWORD_TEST_SECRET` |

## Deployment proof standard

A deployment is proven when all of the following are true:

1. CodeBuild build completed successfully
2. App Runner serves the expected `git-<sha>` image
3. `GET /api/health` returns `"ok":true` with matching `commitSha`
4. The relevant live production path works

## What is no longer the normal method

These are legacy / emergency operator tools, not the default loop:

- `pnpm aws:deploy` / `deploy/aws/deploy-app.ps1`
- Local Docker-based production deploys

Bootstrap (one-time): `deploy/aws/provision.ps1`.

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
