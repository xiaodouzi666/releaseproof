#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/sas/bootstrap-ubuntu.sh" >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "Cannot identify this operating system." >&2
  exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release
if [[ ${ID:-} != "ubuntu" ]] || [[ ${VERSION_ID:-} != "22.04" && ${VERSION_ID:-} != "24.04" ]]; then
  echo "Supported hosts are Ubuntu 22.04 and 24.04; found ${PRETTY_NAME:-unknown}." >&2
  exit 1
fi

cpu_count="$(nproc)"
memory_kib="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
# Alibaba's marketed 2 GiB SAS plan reports roughly 1.58 GiB through
# /proc/meminfo after host/platform reservation. Keep enough headroom for the
# build plus the swap file without rejecting that supported plan.
if (( cpu_count < 2 )) || (( memory_kib < 1500000 )); then
  echo "This deployment requires at least 2 vCPU and approximately 2 GiB RAM; found ${cpu_count} vCPU and ${memory_kib} KiB." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git gnupg jq nginx

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

architecture="$(dpkg --print-architecture)"
cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=${architecture} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable
EOF

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker nginx

install -d -o root -g root -m 0700 /etc/releaseproof

if ! swapon --noheadings --show=NAME | grep -q .; then
  if ! fallocate -l 2G /swapfile; then
    dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
  fi
  chmod 0600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  if ! grep -qF '/swapfile none swap sw 0 0' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi

docker --version
docker compose version
nginx -v
jq --version
free -h
echo "Ubuntu SAS prerequisites are ready. The Qwen key has not been requested or stored by this script."
