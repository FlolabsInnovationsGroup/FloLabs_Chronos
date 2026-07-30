#!/bin/bash
set -x
lsblk
DISK=$(lsblk -dpno NAME,TYPE | awk '$2=="disk" && $1 != "/dev/nvme0n1" {print $1; exit}')
PART="${DISK}p1"
echo "DISK=$DISK PART=$PART"
growpart "$DISK" 1 || true
mkdir -p /mnt/recovery
mount "$PART" /mnt/recovery
df -h /mnt/recovery
du -sh /mnt/recovery/var/lib/docker 2>/dev/null || true
rm -rf /mnt/recovery/var/lib/docker/*
rm -rf /mnt/recovery/tmp/chronos-build /mnt/recovery/tmp/chronos-deploy.tar.gz 2>/dev/null || true
xfs_growfs /mnt/recovery || true
df -h /mnt/recovery
umount /mnt/recovery
echo RECOVERY_OK
