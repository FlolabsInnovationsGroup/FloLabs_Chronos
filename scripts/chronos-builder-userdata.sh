#!/bin/bash
set -eu
exec > /var/log/chronos-builder.log 2>&1
export COMMIT_SHA=6c6f0985ddb6129ecb002b1ee71f116ad3d1a592
export AWS_REGION=us-east-1
export REGISTRY=975049954782.dkr.ecr.us-east-1.amazonaws.com
SHORT_SHA="$(printf '%.12s' "$COMMIT_SHA")"
IMAGE_TAG="git-${SHORT_SHA}"
IMAGE_URI="${REGISTRY}/flolabs-chronos:${IMAGE_TAG}"
LATEST_URI="${REGISTRY}/flolabs-chronos:latest"
BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

yum install -y docker aws-cli
systemctl enable --now docker
if ! swapon --show | grep -q swapfile; then
  fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi
docker image prune -af || true
rm -rf /tmp/chronos-build /tmp/chronos-deploy.tar.gz
aws s3 cp s3://flolabs-chronos-backups/hosting-ec2/chronos-deploy.tar.gz /tmp/chronos-deploy.tar.gz --region "$AWS_REGION"
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
echo BUILD_DONE tag="$IMAGE_TAG" >> /var/log/chronos-builder.log
