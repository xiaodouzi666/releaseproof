#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/sas/collect-evidence.sh [PUBLIC_BASE_URL]" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="${repo_root}/deploy/ecs/docker-compose.prod.yml"
env_file="${RELEASEPROOF_ENV_FILE:-/etc/releaseproof/releaseproof.env}"
project_name="releaseproof"
public_base_url="${1:-}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
evidence_dir="${RELEASEPROOF_EVIDENCE_DIR:-/tmp/releaseproof-evidence-${timestamp}}"

umask 077
mkdir -p "${evidence_dir}"
compose=(docker compose --project-name "${project_name}" --env-file "${env_file}" -f "${compose_file}")
container_id="$("${compose[@]}" ps -q releaseproof)"
if [[ -z ${container_id} ]]; then
  echo "ReleaseProof container is not running." >&2
  exit 1
fi

{
  echo "captured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "hostname=$(hostname)"
  echo "os=$(grep '^PRETTY_NAME=' /etc/os-release | cut -d= -f2- | tr -d '\"')"
  echo "kernel=$(uname -r)"
  echo "git_revision=$(git -C "${repo_root}" rev-parse HEAD)"
  echo "git_tree=$(git -C "${repo_root}" status --porcelain --untracked-files=no | wc -l | tr -d ' ') tracked changes"
  docker --version
  docker compose version
  nginx -v 2>&1
} > "${evidence_dir}/deployment-metadata.txt"

"${compose[@]}" ps > "${evidence_dir}/compose-ps.txt"
docker inspect "${container_id}" | jq '.[0] | {
  Name,
  Image,
  Created,
  State: {Status: .State.Status, Running: .State.Running, Health: .State.Health},
  RestartPolicy: .HostConfig.RestartPolicy,
  ReadonlyRootfs: .HostConfig.ReadonlyRootfs,
  CapDrop: .HostConfig.CapDrop,
  SecurityOpt: .HostConfig.SecurityOpt,
  PortBindings: .HostConfig.PortBindings,
  Mounts: [.Mounts[] | {Type, Name, Destination, RW}]
}' > "${evidence_dir}/container-inspect-sanitized.json"

curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8787/api/health \
  | jq . > "${evidence_dir}/health-local.json"
jq -e '.deploymentTarget == "alibaba-sas" and .model.mode == "live-qwen" and .store.healthy == true' \
  "${evidence_dir}/health-local.json" >/dev/null

if [[ -n ${public_base_url} ]]; then
  public_base_url="${public_base_url%/}"
  curl --fail --silent --show-error --max-time 15 "${public_base_url}/api/health" \
    | jq . > "${evidence_dir}/health-public.json"
  jq -e '.deploymentTarget == "alibaba-sas" and .model.mode == "live-qwen" and .store.healthy == true' \
    "${evidence_dir}/health-public.json" >/dev/null
  curl --fail --silent --show-error --max-time 15 --head "${public_base_url}/" \
    > "${evidence_dir}/public-response-headers.txt"
fi

(cd "${evidence_dir}" && find . -maxdepth 1 -type f ! -name SHA256SUMS -print0 \
  | sort -z \
  | xargs -0 sha256sum > SHA256SUMS)
chmod -R go-rwx "${evidence_dir}"

echo "Non-secret deployment evidence: ${evidence_dir}"
echo "Inspect every file before publication. The populated environment file and container environment are intentionally excluded."
