#!/usr/bin/env bash
set -Eeuo pipefail

base_url="${1:-http://127.0.0.1:8787}"
base_url="${base_url%/}"
idempotency_key="sas-smoke-$(date -u +%Y%m%dT%H%M%SZ)-${RANDOM}"

response="$(curl --fail --silent --show-error --max-time 15 \
  -X POST "${base_url}/api/workflows" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: ${idempotency_key}" \
  --data '{"scenarioId":"restricted-health-denied"}')"
workflow_id="$(jq -er '.id' <<<"${response}")"

deadline=$((SECONDS + 120))
while (( SECONDS < deadline )); do
  response="$(curl --fail --silent --show-error --max-time 15 "${base_url}/api/workflows/${workflow_id}")"
  status="$(jq -er '.status' <<<"${response}")"
  case "${status}" in
    denied)
      break
      ;;
    failed|rejected|completed|rolled_back)
      echo "Unexpected terminal workflow status: ${status}" >&2
      exit 1
      ;;
  esac
  sleep 2
done

if [[ ${status:-unknown} != "denied" ]]; then
  echo "Live smoke workflow did not reach denied within 120s (last status: ${status:-unknown})." >&2
  exit 1
fi

jq -e '
  .scenarioId == "restricted-health-denied" and
  .status == "denied" and
  .decision.outcome == "deny" and
  .model.mode == "live-qwen" and
  .model.provider == "Qwen Cloud" and
  .model.calls >= 2 and
  ([.events[] | select(.actor == "qwen")] | length) >= 2 and
  (.events[0].previousHash == null) and
  (.events as $events |
    [range(1; ($events | length)) as $index |
      $events[$index].previousHash == $events[$index - 1].hash
    ] | all) and
  (.error == null)
' <<<"${response}" >/dev/null

jq '{
  id,
  scenarioId,
  status,
  decision: {outcome: .decision.outcome, reasonCodes: .decision.reasonCodes},
  model: {
    mode: .model.mode,
    provider: .model.provider,
    model: .model.model,
    fallbackUsed: .model.fallbackUsed,
    calls: .model.calls,
    promptTokens: .model.promptTokens,
    completionTokens: .model.completionTokens,
    latencyMs: .model.latencyMs
  },
  qwenAuditEvents: [.events[] | select(.actor == "qwen") | {sequence, type, timestamp, actor, hash, previousHash}]
}' <<<"${response}"
