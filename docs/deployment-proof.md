# Deployment and Qwen evidence checklist

This is an **evidence workbench**, not a completion claim. Replace every PENDING field with a real public link or artifact from the final submitted ReleaseProof commit. Do not paste this file into Devpost while placeholders remain.

Current status at authoring time:

- Expected public repository: [https://github.com/xiaodouzi666/releaseproof](https://github.com/xiaodouzi666/releaseproof) — **PENDING public reachability verification**.
- Validated candidate revision: [`f46d4eb61cebe4d2830aae162225b645c84eb734`](https://github.com/xiaodouzi666/releaseproof/commit/f46d4eb61cebe4d2830aae162225b645c84eb734) — source-pinned locally; **PENDING public reachability verification**.

- Alibaba Cloud runtime: **PENDING — not verified here**
- Public live URL: **PENDING — not verified here**
- Successful live Qwen workflow: **PENDING — not verified here**
- Alibaba Cloud screenshots: **PENDING — not captured here**
- Public repository and immutable commit: **PENDING — not published here**
- Updated ReleaseProof thumbnail/architecture capture: **local assets rendered and visually checked; public commit permalinks PENDING**
- Final post-pivot test/evaluation run: **local working tree passed (62/62 tests, 16/16 deterministic cases); immutable final-commit run PENDING**

Historical pre-pivot test totals or screenshots are not ReleaseProof evidence and must not be reused.

## Judge evidence index

Fill this table last and open every URL in a signed-out/incognito browser.

| Requirement | Evidence | Status |
| --- | --- | --- |
| Public source code | [Expected repository URL](https://github.com/xiaodouzi666/releaseproof) | PENDING — public reachability not verified |
| OSI license | [LICENSE](../LICENSE) plus public link | Local file present; public detection pending |
| Immutable submitted revision | [Candidate revision](https://github.com/xiaodouzi666/releaseproof/commit/f46d4eb61cebe4d2830aae162225b645c84eb734) | Candidate pinned; publication PENDING |
| Qwen client/base URL | [Candidate-pinned `server/qwen.ts`](https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/qwen.ts) | Source identified; live call PENDING |
| Structured extraction request/schema | [PENDING: model, response format, validation lines] | PENDING |
| Read-only function-planning request | [PENDING: recipient/dataset/current-share/agreement definitions] | PENDING |
| Tool validation and dispatch | [PENDING: allow-list, rebinding, mandatory completion, dispatch] | PENDING |
| Deterministic release policy | [Candidate-pinned `server/policy.ts`](https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/policy.ts) | Source identified; 16/16 local cases |
| Exact manifest owner checkpoint | [Candidate-pinned workflow orchestrator (`server/workflow-service.ts`)](https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/workflow-service.ts) | Source identified; locally tested |
| Idempotent share and verification | [Candidate-pinned `server/tools.ts`](https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/tools.ts) | Source identified; locally tested |
| Recall and read-after-recall | [Candidate-pinned workflow orchestrator](https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/workflow-service.ts) | Source identified; locally tested |
| Alibaba Cloud live backend | [PENDING: public HTTPS URL] | PENDING |
| Health endpoint | [PENDING: public /api/health URL] | PENDING |
| Required Devpost Alibaba Cloud screenshot | [PENDING: PNG/JPG/JPEG upload under form limit] | PENDING |
| Cloud resource/runtime capture | [PENDING: repository-hosted artifact] | PENDING |
| Live ReleaseProof workflow capture | [PENDING] | PENDING |
| Live-Qwen receipt | [PENDING: provider badge and non-zero completed calls] | PENDING |
| Final evaluation/test output | [Candidate-pinned evaluation source](https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/evaluation.ts) and [local verification record](evaluation.md#validated-releaseproof-candidate-snapshot) | 62/62 tests, 16/16 cases, typecheck/build/audit passed locally; CI PENDING |
| Public demo video | [PENDING: URL, strictly under 3:00] | PENDING |
| Updated architecture/thumbnail | [Candidate-pinned architecture PNG](https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/public/architecture.png) and [3:2 thumbnail](https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/public/devpost-thumbnail-3x2.png) | Local assets ready; public reachability PENDING |

## What proves Qwen Cloud use

ReleaseProof targets Qwen Cloud's OpenAI-compatible Chat Completions API. A normal live workflow is designed to make two logical requests to the same endpoint. The request shapes below document the intended integration; they are not proof that a live call succeeded.

### Request A — structured release-intent extraction

~~~http
POST https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
Authorization: Bearer <REDACTED>
Content-Type: application/json

{
  "model": "qwen3.7-plus",
  "messages": ["synthetic release request and optional image"],
  "temperature": 0,
  "enable_thinking": false,
  "response_format": { "type": "json_object" }
}
~~~

The validated intent represents:

- external recipient/vendor;
- dataset;
- release tier;
- requested field-actions;
- purpose;
- finite TTL;
- optional agreement reference;
- confidence; and
- text/vision source mode.

### Request B — read-only evidence plan

~~~http
POST https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
Authorization: Bearer <REDACTED>
Content-Type: application/json

{
  "model": "qwen3.7-plus",
  "messages": ["validated extracted release intent"],
  "temperature": 0,
  "enable_thinking": false,
  "tools": [
    "recipient_lookup",
    "dataset_lookup",
    "share_current",
    "agreement_lookup"
  ],
  "tool_choice": "required",
  "parallel_tool_calls": true
}
~~~

The server must:

1. allow-list the function names;
2. parse strict arguments;
3. rebind recipient/dataset/agreement identifiers to the validated extraction;
4. append any mandatory recipient, dataset, or current-share read Qwen omitted;
5. accept agreement lookup only for a validated agreement reference; and
6. dispatch the reads before deterministic policy.

Qwen is never offered a share-create, recall, approval, DLP override, raw credential, or policy-override function.

The base URL can also be a compatible workspace-specific Singapore address. The key and domain must belong to compatible regions/workspaces.

Official references:

- [Qwen Cloud API key preparation](https://docs.qwencloud.com/api-reference/preparation/api-key)
- [Qwen Cloud first API call](https://docs.qwencloud.com/developer-guides/getting-started/first-api-call)
- [Model Studio base URL overview](https://www.alibabacloud.com/help/en/model-studio/base-url)
- [Qwen structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output)
- [Qwen function calling](https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling)
- [Qwen visual understanding](https://www.alibabacloud.com/help/en/model-studio/vision-model)

### Required source permalinks

Candidate-pinned source locations (publication and public reachability remain PENDING):

~~~text
Client and base URL:       https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/qwen.ts
Structured extraction:     https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/qwen.ts#L295-L330
Extraction schema:         https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/qwen.ts#L12-L23
Read-plan request:         https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/qwen.ts#L345-L417
Plan validation/rebinding: https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/qwen.ts#L420-L449
Mandatory-read completion: https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/qwen.ts#L452-L457
Actual tool dispatch:      https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/workflow-service.ts#L482-L528
Provider disclosure:       https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/qwen.ts#L269-L284
Release policy:            https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/policy.ts
Share/verify/recall:       https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/tools.ts
Workflow orchestration:    https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/server/workflow-service.ts
Architecture artifact:     https://github.com/xiaodouzi666/releaseproof/blob/f46d4eb61cebe4d2830aae162225b645c84eb734/public/architecture.png
~~~

Together they should visibly establish that Qwen performs structured extraction and tool planning, while the server owns catalog reads, deterministic policy, exact-manifest approval, share creation, verification, and recall.

### Required live workflow evidence

Create one fresh synthetic workflow while a valid Qwen Cloud key is configured:

- health reports the live provider mode, model, deployment target, and service version without credentials;
- the workflow metadata reports Qwen Cloud/live mode, model, logical call count, latency, and token fields;
- the UI visibly labels the run as live Qwen Cloud;
- the workflow reaches a terminal outcome using actual completed model calls;
- the audit timeline contains Qwen-authored extraction/planning receipts; and
- no capture contains the API key, authorization header, cookie, local environment file, or private account credential.

Suggested non-secret health capture:

~~~bash
curl --fail --silent https://YOUR_DOMAIN/api/health
~~~

Illustrative response shape, not evidence:

~~~json
{
  "status": "ok",
  "service": "releaseproof-api",
  "version": "...",
  "deploymentTarget": "alibaba-sas",
  "timestamp": "...",
  "uptimeSeconds": 123,
  "model": {
    "mode": "live-qwen",
    "provider": "Qwen Cloud",
    "model": "qwen3.7-plus",
    "disclosure": "..."
  },
  "store": {
    "mode": "file",
    "healthy": true
  }
}
~~~

Health proves configuration and runtime identity, not a successful inference. The completed workflow receipt supplies live-call evidence.

## What proves Alibaba Cloud deployment

The preferred target is an Alibaba Cloud ECS or Simple Application Server instance running the submitted container. The official competition evidence requires a repository code link that shows Qwen Cloud use/base URL and an Alibaba Cloud runtime screenshot uploaded through the Devpost form.

### Screenshot A — Alibaba Cloud resource

Capture the console with:

- Alibaba Cloud console/product chrome visible;
- ECS or Simple Application Server product identity;
- resource name such as **releaseproof-demo**;
- region;
- running/healthy status;
- public IP or bound domain if safe; and
- capture time where available.

Redact account email, billing/payment details, RAM keys, unrelated resources, and unnecessary private-network details. Do not crop away the Alibaba Cloud product identity.

Save as:

~~~text
docs/assets/deployment/alibaba-cloud-resource.png  [PENDING]
~~~

### Screenshot B — runtime on the instance

Capture commands that bind the submitted source to the running service:

~~~bash
cd /opt/releaseproof
git rev-parse HEAD
docker compose -f deploy/ecs/docker-compose.prod.yml ps
curl --fail --silent http://127.0.0.1:8787/api/health
~~~

The frame should show commit SHA, healthy **releaseproof** container, truthful deployment target, provider mode, model, and service version. It must not show the environment file or inspected environment variables.

Save as:

~~~text
docs/assets/deployment/alibaba-cloud-runtime.png  [PENDING]
~~~

### Screenshot C — public live workflow

Capture the browser address bar with HTTPS and a synthetic ReleaseProof workflow that shows:

- ReleaseProof brand and provider badge;
- normalized recipient/dataset/purpose/TTL;
- evidence tool receipts;
- requested-versus-effective manifest;
- owner checkpoint or completed observed state; and
- no real vendor/customer information.

Save as:

~~~text
docs/assets/deployment/live-release-workflow.png  [PENDING]
~~~

### Screenshot D — verified recall

Capture the same workflow after recall with inactive/recalled state and verification evidence.

~~~text
docs/assets/deployment/verified-recall.png  [PENDING]
~~~

### Optional Screenshot E — Qwen monitoring

Capture successful model invocation monitoring in the same time window. Redact account/quota/billing data. This corroborates but does not replace source and workflow evidence.

~~~text
docs/assets/deployment/qwen-invocation.png  [PENDING]
~~~

## Candidate verification runbook

Run against the exact public candidate:

~~~bash
# Immutable host revision
git rev-parse HEAD

# Container status and local service
docker compose -f deploy/ecs/docker-compose.prod.yml ps
curl --fail --silent http://127.0.0.1:8787/api/health

# Public TLS, health, and frontend
curl --fail --silent --show-error https://YOUR_DOMAIN/api/health
curl --fail --silent --show-error https://YOUR_DOMAIN/ | head

# Final software evidence
pnpm typecheck
pnpm test
pnpm eval
pnpm build
~~~

Then manually exercise:

1. **Minimized release:** verified recipient request -> grounded evidence -> constrained manifest -> owner approval -> idempotent share -> exact read-back.
2. **Hard denial:** unverified recipient or dangerous raw/consent-override request -> deterministic denial -> no approval/write path.
3. **Verified recall:** completed synthetic share -> recall -> observed inactive/absent state.
4. **Replay check:** repeat the execution request and confirm no duplicate active share.

Reload pages to test persistence and deep-link/static fallback behavior.

## Screenshot/video sanitization

Inspect every frame for:

- [ ] Qwen/RAM keys or partial keys
- [ ] Authorization headers, cookies, session tokens, QR codes, password-manager overlays
- [ ] local environment-file contents
- [ ] Alibaba Cloud UID/account data where unnecessary
- [ ] billing amount, payment method, invoices
- [ ] SSH keys, host history, unrelated commands
- [ ] real vendor, agreement, dataset, employee, or customer data
- [ ] unrelated tabs, bookmarks, notifications, or account menus

If a secret appears in any uploaded original, rotate it before publication. Blurring a later edit does not undo exposure of an earlier public upload.

## Public-link QA

- [ ] Every URL opens signed out/incognito.
- [ ] Repository is public with source, assets, run instructions, tests, and detectable MIT license.
- [ ] Source links are pinned to the submitted commit.
- [ ] Live app is free, public, and independent of the local network.
- [ ] Health exposes no secret or filesystem path.
- [ ] Demo data is visibly synthetic.
- [ ] Video is public, strictly under 3:00, and plays signed out.
- [ ] Narration and visible badge agree on live-Qwen versus recorded-demo mode.
- [ ] Updated thumbnail and architecture contain ReleaseProof branding.
- [ ] Required Alibaba screenshot is in the accepted format/size and preserves product identity.
- [ ] Recall is described as revoking the synthetic share, not erasing copied data.
- [ ] Repository, video, deployed revision, and evidence links will remain unchanged after the deadline.
- [ ] Submitted/public copy contains no unintended PENDING or YOUR_DOMAIN placeholders.

Useful final search:

~~~bash
rg -n "PENDING|YOUR_DOMAIN|<owner>|<repo>|<workspace-id>|sk-[A-Za-z0-9]" README.md docs deploy
~~~

PENDING is intentionally allowed in this evidence workbench until the real deployment phase. It must not survive in submitted public copy.
