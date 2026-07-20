#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/sas/deploy.sh" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="${repo_root}/deploy/ecs/docker-compose.prod.yml"
env_file="${RELEASEPROOF_ENV_FILE:-/etc/releaseproof/releaseproof.env}"
project_name="releaseproof"

for command_name in docker git curl jq; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
done

if [[ ! -f ${env_file} ]] || [[ -L ${env_file} ]]; then
  echo "Missing ${env_file}. Install deploy/sas/releaseproof.env.example there, add the key privately, and chmod 600." >&2
  exit 1
fi

owner="$(stat -c '%U' "${env_file}")"
if [[ ${owner} != "root" ]]; then
  echo "${env_file} must be owned by root (found ${owner})." >&2
  exit 1
fi

permissions="$(stat -c '%a' "${env_file}")"
if (( (8#${permissions} & 077) != 0 )); then
  echo "${env_file} must not be readable or writable by group/other (expected mode 600)." >&2
  exit 1
fi

key_lines="$(grep -c '^DASHSCOPE_API_KEY=' "${env_file}" || true)"
if [[ ${key_lines} != "1" ]]; then
  echo "${env_file} must contain exactly one DASHSCOPE_API_KEY assignment." >&2
  exit 1
fi

if ! grep -Eq '^DASHSCOPE_API_KEY=sk-[A-Za-z0-9._-]+$' "${env_file}"; then
  echo "${env_file} must contain a non-placeholder DASHSCOPE_API_KEY beginning with sk-." >&2
  exit 1
fi

if grep -Eq '^(VITE_|NEXT_PUBLIC_|PUBLIC_).*KEY=' "${env_file}"; then
  echo "Refusing a public/frontend-prefixed key variable in ${env_file}." >&2
  exit 1
fi

cd "${repo_root}"
revision="$(git rev-parse --verify HEAD)"
if [[ -n $(git status --porcelain --untracked-files=no) ]]; then
  echo "Tracked files are modified. Deploy a reviewed commit, not a dirty working tree." >&2
  exit 1
fi

compose=(docker compose --project-name "${project_name}" --env-file "${env_file}" -f "${compose_file}")

"${compose[@]}" config --quiet
"${compose[@]}" build --pull
"${compose[@]}" up -d --remove-orphans

RELEASEPROOF_ENV_FILE="${env_file}" bash "${repo_root}/deploy/sas/healthcheck.sh"

echo "ReleaseProof revision ${revision} is healthy on 127.0.0.1:8787."
echo "Next: install the Nginx proxy and collect the non-secret evidence bundle."
