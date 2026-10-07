#!/usr/bin/env bash
# Run on a fresh Ubuntu 24.04 EC2 host: sudo bash deploy/ec2/bootstrap-ubuntu.sh
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo 'Requires Ubuntu 24.04 LTS.' >&2; exit 1; }
apt-get update
apt-get install -y ca-certificates curl git openssl util-linux libc-bin
if command -v docker >/dev/null; then
  docker compose version
  docker buildx version
  systemctl enable --now docker
  docker info >/dev/null
  echo 'Existing Docker retained; helper dependencies installed and daemon verified.'
  exit 0
fi
# Do not automatically remove conflicting packages on an existing host.
for package in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
  if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
    echo "Conflicting package: $package. Use a fresh host or resolve it manually." >&2
    exit 1
  fi
done
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
  "$(dpkg --print-architecture)" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version
docker buildx version
docker info >/dev/null
echo 'Docker ready. Use sudo bash deploy/ec2/manage.sh for operations.'
