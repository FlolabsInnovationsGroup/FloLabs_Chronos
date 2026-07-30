#!/bin/bash
# Disk-full recovery: grow root FS, prune Docker, restore Chronos, deploy 96ec492.
exec >> /var/log/chronos-recovery-userdata.log 2>&1
set -x
echo "=== recovery $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

FLAG=/var/lib/chronos-recovery-v2.done
[ -f "$FLAG" ] && exit 0

# Expand root volume after EBS resize
ROOT_PART=$(lsblk -no PATH,TYPE | awk '$2=="part" && $1 ~ /nvme0n1p1|xvda1/ {print $1; exit}')
[ -n "$ROOT_PART" ] && growpart "${ROOT_PART%[0-9]*}" "${ROOT_PART##*p}" 2>/dev/null || true
FSTYPE=$(findmnt -n -o FSTYPE /)
if [ "$FSTYPE" = "xfs" ]; then
  xfs_growfs -d / || true
elif [ "$FSTYPE" = "ext4" ]; then
  resize2fs "$ROOT_PART" || true
fi

df -h /

systemctl start docker || true
systemctl restart amazon-ssm-agent || true

docker system prune -af --volumes || true
rm -rf /tmp/chronos-build /tmp/chronos-deploy.tar.gz /var/lib/docker/tmp/* 2>/dev/null || true

REGISTRY="975049954782.dkr.ecr.us-east-1.amazonaws.com"
REGION="us-east-1"
COMMIT_SHA="96ec492e830f17b4b817e2203743d3a1dfde2623"

if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile || true
fi

aws s3 cp "s3://flolabs-chronos-backups/hosting-ec2/ec2-deploy-from-s3.sh" /tmp/ec2-deploy-from-s3.sh --region "$REGION"
chmod +x /tmp/ec2-deploy-from-s3.sh
sed -i 's/\r$//' /tmp/ec2-deploy-from-s3.sh

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker pull "${REGISTRY}/flolabs-chronos:latest"
cd /opt/hosting && docker compose up -d --force-recreate chronos

nohup env COMMIT_SHA="$COMMIT_SHA" AWS_REGION="$REGION" bash /tmp/ec2-deploy-from-s3.sh \
  >> /tmp/chronos-ec2-deploy.log 2>&1 &

touch "$FLAG"
echo "=== recovery finished $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
