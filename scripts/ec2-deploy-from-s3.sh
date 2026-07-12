#!/usr/bin/env bash
# Deploy Chronos on the production EC2 host when CodeBuild is unavailable.
# Expects source tarball at s3://flolabs-chronos-backups/hosting-ec2/chronos-deploy.tar.gz
set -eu

AWS_REGION="${AWS_REGION:-us-east-1}"
REGISTRY="${REGISTRY:-975049954782.dkr.ecr.us-east-1.amazonaws.com}"
COMMIT_SHA="${COMMIT_SHA:?COMMIT_SHA required}"
SHORT_SHA="$(printf '%.12s' "$COMMIT_SHA")"
IMAGE_TAG="git-${SHORT_SHA}"
IMAGE_URI="${REGISTRY}/flolabs-chronos:${IMAGE_TAG}"
LATEST_URI="${REGISTRY}/flolabs-chronos:latest"
BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG="/tmp/chronos-ec2-deploy.log"

exec > >(tee -a "$LOG") 2>&1
echo "=== Chronos EC2 deploy started $(date -u +%Y-%m-%dT%H:%M:%SZ) commit=${COMMIT_SHA} ==="

if ! swapon --show | grep -q swapfile; then
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile || true
fi

docker image prune -af || true
rm -rf /tmp/chronos-build /tmp/chronos-deploy.tar.gz

aws s3 cp "s3://flolabs-chronos-backups/hosting-ec2/chronos-deploy.tar.gz" /tmp/chronos-deploy.tar.gz --region "$AWS_REGION"
mkdir -p /tmp/chronos-build
tar -xzf /tmp/chronos-deploy.tar.gz -C /tmp/chronos-build
cd /tmp/chronos-build

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"

docker build \
  --build-arg BUILD_COMMIT_SHA="$COMMIT_SHA" \
  --build-arg BUILD_COMMIT_REF=main \
  --build-arg BUILD_IMAGE_TAG="$IMAGE_TAG" \
  --build-arg BUILD_TIMESTAMP="$BUILD_TIMESTAMP" \
  -t "$IMAGE_URI" \
  -t "$LATEST_URI" \
  .

docker push "$IMAGE_URI"
docker push "$LATEST_URI"

CHRONOS_ENV="/opt/hosting/chronos.env"
if [ -f "$CHRONOS_ENV" ]; then
  sed -i 's/\r$//' "$CHRONOS_ENV"
  if grep -qE '^DATABASE_URL=postgesql://postges:' "$CHRONOS_ENV"; then
    echo "WARNING: fixing corrupted DATABASE_URL username/scheme in chronos.env"
    perl -pi -e 's/postgesql:\/\/postges:/postgresql:\/\/postgres:/g' "$CHRONOS_ENV"
  fi
  if ! grep -qE '^DATABASE_URL=postgresql://postgres:' "$CHRONOS_ENV"; then
    echo "ERROR: chronos.env DATABASE_URL must use postgresql://postgres:" >&2
    exit 1
  fi
fi

for key in BUILD_COMMIT_SHA BUILD_COMMIT_REF BUILD_IMAGE_TAG BUILD_TIMESTAMP; do
  val=""
  case "$key" in
    BUILD_COMMIT_SHA) val="$COMMIT_SHA" ;;
    BUILD_COMMIT_REF) val="main" ;;
    BUILD_IMAGE_TAG) val="$IMAGE_TAG" ;;
    BUILD_TIMESTAMP) val="$BUILD_TIMESTAMP" ;;
  esac
  if grep -q "^${key}=" "$CHRONOS_ENV" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$CHRONOS_ENV"
  else
    echo "${key}=${val}" >> "$CHRONOS_ENV"
  fi
done

cd /opt/hosting
docker compose up -d --force-recreate chronos

echo "=== Chronos EC2 deploy finished $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
