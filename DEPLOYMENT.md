# Chronos deployment workflow

## Production stack

| Item | Value |
|---|---|
| **Production domain** | `https://athensgreecemarathon.com` |
| **EC2 instance** | `i-0292b7ec02f26a25b` (`44.195.108.173`, `us-east-1`) |
| **Docker Compose dir** | `/opt/hosting/` |
| **ECR repository** | `975049954782.dkr.ecr.us-east-1.amazonaws.com/flolabs-chronos` |
| **CodePipeline** | `flolabs-chronos-pipeline` (auto-triggers on push to `main`) |
| **CodeBuild project** | `flolabs-chronos-deploy` |
| **Region / account** | `us-east-1` / `975049954782` |

Nginx on the EC2 proxies `athensgreecemarathon.com` → container port 3000 (`127.0.0.1:3000:3000`).

## Deploy flow

### Normal path — push to main

```bash
git push origin main
```

This triggers `flolabs-chronos-pipeline`, which runs CodeBuild. The build:

1. Builds the Docker image, tagging it `git-<12-char-sha>` and `latest`
2. Pushes both tags to ECR
3. SSMs into the EC2 to: ECR login → `docker image prune -f` → pull `:latest` → `docker compose up -d --force-recreate chronos`
4. Polls `https://athensgreecemarathon.com/api/health` until `"ok":true` with the new `commitSha`

Build succeeds = container is live with the pushed commit.

### Manual pipeline trigger

```bash
aws codepipeline start-pipeline-execution --name flolabs-chronos-pipeline --region us-east-1
```

### Manual EC2 update (if pipeline post_build fails)

```bash
aws ssm send-command \
  --instance-ids "i-0292b7ec02f26a25b" \
  --document-name "AWS-RunShellScript" \
  --region us-east-1 \
  --parameters '{"commands":[
    "aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 975049954782.dkr.ecr.us-east-1.amazonaws.com",
    "docker image prune -f",
    "docker pull 975049954782.dkr.ecr.us-east-1.amazonaws.com/flolabs-chronos:latest",
    "cd /opt/hosting && docker compose up -d --force-recreate chronos"
  ]}'
```

Poll the command status:

```bash
aws ssm get-command-invocation \
  --command-id <CommandId> \
  --instance-id "i-0292b7ec02f26a25b" \
  --region us-east-1 \
  --query '{Status:Status,Output:StandardOutputContent}'
```

## Verify

```bash
curl -s https://athensgreecemarathon.com/api/health
# Expected: {"ok":true,"commitSha":"<sha>", ...}
```

A deployment is proven when `"ok":true` and `"commitSha"` matches the pushed commit.

## Runtime secrets

Runtime env vars come from `/opt/hosting/chronos.env` on the EC2 at container start. They are not baked into the image at build time. To change a secret, update that file (sourced from `s3://flolabs-chronos-backups/hosting-ec2/chronos.env`) and restart the container.
