#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="${repo_root}/deploy/ecs/docker-compose.prod.yml"
env_file="${RELEASEPROOF_ENV_FILE:-/etc/releaseproof/releaseproof.env}"
project_name="releaseproof"
timeout_seconds="${RELEASEPROOF_HEALTH_TIMEOUT_SECONDS:-120}"

if [[ ! -r ${env_file} ]]; then
  echo "Cannot read server environment file ${env_file}." >&2
  exit 1
fi

compose=(docker compose --project-name "${project_name}" --env-file "${env_file}" -f "${compose_file}")
container_id="$("${compose[@]}" ps -q releaseproof)"
if [[ -z ${container_id} ]]; then
  echo "ReleaseProof container is not running." >&2
  exit 1
fi

deadline=$((SECONDS + timeout_seconds))
while (( SECONDS < deadline )); do
  container_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "${container_id}")"
  if [[ ${container_health} == "healthy" ]]; then
    break
  fi
  if [[ ${container_health} == "unhealthy" ]]; then
    echo "Container health check reports unhealthy." >&2
    exit 1
  fi
  sleep 2
done

if [[ ${container_health:-missing} != "healthy" ]]; then
  echo "Container did not become healthy within ${timeout_seconds}s." >&2
  exit 1
fi

health_json="$(curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8787/api/health)"
jq -e '
  .status == "ok" and
  .service == "releaseproof-api" and
  .deploymentTarget == "alibaba-sas" and
  .model.mode == "live-qwen" and
  .model.provider == "Qwen Cloud" and
  .store.mode == "file" and
  .store.healthy == true
' <<<"${health_json}" >/dev/null

jq '{status, service, version, deploymentTarget, timestamp, model, store}' <<<"${health_json}"
