#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/sas/install-http-proxy.sh" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_config="${repo_root}/deploy/sas/nginx-http.conf"
target_config="/etc/nginx/sites-available/releaseproof"

install -o root -g root -m 0644 "${source_config}" "${target_config}"
rm -f /etc/nginx/sites-enabled/default
ln -sfn "${target_config}" /etc/nginx/sites-enabled/releaseproof
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --max-time 10 http://127.0.0.1/api/health | jq '{status, service, deploymentTarget, model, store}'
echo "HTTP proxy is ready. Alibaba Cloud's server firewall must allow inbound TCP 80."
