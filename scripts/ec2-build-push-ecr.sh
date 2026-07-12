#!/usr/bin/env bash
# Build and push Chronos image to ECR (run on a builder instance, not production).
set -eu

AWS_REGION="${AWS_REGION:-us-east-1}"
REGISTRY="${REGISTRY:-975049954782.dkr.ecr.us-east-1.amazonaws.com}"
COMMIT_SHA="${COMMIT_SHA:?COMMIT_SHA required}"
SHORT_SHA="$(printf '%.12s' "$COMMIT_SHA")"
IMAGE_TAG="git-${SHORT_SHA}"
IMAGE_URI="${REGISTRY}/flolabs-chronos:${IMAGE_TAG}"
LATEST_URI="${REGISTRY}/flolabs-chronos:latest"
BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG="/tmp/chronos-ec2-build.log"

exec > >(tee -a "$LOG") 2>&1
echo "=== Chronos ECR build started $(date -u +%Y-%m-%dT%H:%M:%SZ) commit=${COMMIT_SHA} ==="

if ! swapon --show | grep -q swapfile; then
  if [ ! -f /swapfile ]; then
    fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile || true
fi

systemctl start docker
docker image prune -af || true
BUILD_DIR="/var/lib/chronos-build"
rm -rf "$BUILD_DIR" /tmp/chronos-deploy.tar.gz

aws s3 cp "s3://flolabs-chronos-backups/hosting-ec2/chronos-deploy.tar.gz" /tmp/chronos-deploy.tar.gz --region "$AWS_REGION"
mkdir -p "$BUILD_DIR"
tar -xzf /tmp/chronos-deploy.tar.gz -C "$BUILD_DIR"
rm -f /tmp/chronos-deploy.tar.gz
cd "$BUILD_DIR"

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

echo "=== Chronos ECR build finished $(date -u +%Y-%m-%dT%H:%M:%SZ) tag=${IMAGE_TAG} ==="
