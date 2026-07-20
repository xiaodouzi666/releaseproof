# Deployment and Qwen evidence checklist

This file is an **evidence workbench**, not a claim of completion. Every item labeled `PENDING` must be replaced with a real, publicly accessible link or repository artifact from the submitted commit. Do not submit placeholder text.

Current status at authoring time:

- Alibaba Cloud runtime deployment: **PENDING - not verified here**
- Public live URL: **PENDING - not verified here**
- Live Qwen invocation: **PENDING - not verified here**
- Cloud-console screenshots: **PENDING - not captured here**
- Public source repository/commit: **PENDING - not published here**

## Evidence index for judges

Fill this table last, after every link has been tested in an incognito/private window.

| Requirement | Evidence | Status |
| --- | --- | --- |
| Public source code | `[PENDING: GitHub repository URL]` | PENDING |
| Immutable submitted revision | `[PENDING: commit permalink]` | PENDING |
| Qwen integration source permalink | `[PENDING: permalink to exact server adapter lines]` | PENDING |
| Qwen structured-extraction permalink | `[PENDING: model + response_format request]` | PENDING |
| Qwen function-planning permalink | `[PENDING: tools + tool_choice request]` | PENDING |
| Tool validation/dispatch permalink | `[PENDING: allow-list, sanitize, mandatory completion, and orchestrator dispatch]` | PENDING |
| Deterministic policy source permalink | `[PENDING: policy engine lines]` | PENDING |
| Human approval gate source permalink | `[PENDING: approval transition lines]` | PENDING |
| Idempotent execution + verification source | `[PENDING: IAM adapter/verifier lines]` | PENDING |
| Alibaba Cloud deployed backend | `[PENDING: public HTTPS URL]` | PENDING |
| Health endpoint | `[PENDING: public /api/health URL]` | PENDING |
| Cloud resource screenshot | `[PENDING: repo-hosted image or public artifact URL]` | PENDING |
| Live application screenshot | `[PENDING]` | PENDING |
| Live-Qwen workflow screenshot | `[PENDING: provider mode must visibly say live Qwen/Qwen Cloud]` | PENDING |
| Evaluation output | [Validated result snapshot](evaluation.md#validated-result-snapshot) | Recorded for code commit `3a64ebb`; public Actions URL still pending |
| Demo video under 3 minutes | `[PENDING: YouTube/Vimeo/Youku URL and duration]` | PENDING |
| License | `[LICENSE](../LICENSE)` | Present locally; public link pending |

## What proves actual Qwen Cloud use

GrantGuard's server integration uses the OpenAI-compatible interface of Alibaba Cloud Model Studio. A live workflow is designed to make two logical requests to the same Chat Completions endpoint. The snippets below describe the implemented request shapes; they are not evidence that a live request has succeeded.

### Request A - structured extraction

```http
POST https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
Authorization: Bearer <REDACTED>
Content-Type: application/json

{
  "model": "qwen3.7-plus",
  "messages": ["..."],
  "temperature": 0,
  "enable_thinking": false,
  "response_format": { "type": "json_object" }
}
```

### Request B - read-only context function plan

```http
POST https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
Authorization: Bearer <REDACTED>
Content-Type: application/json

{
  "model": "qwen3.7-plus",
  "messages": ["validated extracted request"],
  "temperature": 0,
  "enable_thinking": false,
  "tools": [
    "directory_lookup",
    "resource_lookup",
    "access_current"
  ],
  "tool_choice": "required",
  "parallel_tool_calls": true
}
```

The server then allow-lists returned function names, parses strict arguments, replaces accepted identifiers with the already validated extracted subject/resource, appends any mandatory context call Qwen omitted, and dispatches the three actual reads before deterministic policy. Qwen is never offered an IAM write function.

The base URL may instead be a workspace-specific Singapore address:

```text
https://<workspace-id>.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
```

The API key must come from the same region/workspace as the selected domain. Official references:

- [Model Studio base URL overview](https://www.alibabacloud.com/help/en/model-studio/base-url)
- [First Qwen OpenAI-compatible API call](https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen)
- [Qwen structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output)
- [Qwen function calling](https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling)
- [Qwen visual understanding](https://www.alibabacloud.com/help/en/model-studio/vision-model)

### Required source evidence

Create permanent GitHub links pinned to the submitted commit, not `main` branch links. Together, the permalinks should visibly show:

1. server-side construction of the Model Studio client using `DASHSCOPE_API_KEY` and `QWEN_BASE_URL`;
2. the structured extraction request and Zod validation;
3. the separate function-calling request with directory/resource/current-access tools plus optional `ticket_lookup`;
4. function-name/argument validation, trusted-argument sanitization, mandatory-call completion, and actual orchestrator dispatch;
5. response metadata capture and provider-mode disclosure.

Paste them here:

```text
Client construction:       [PENDING]
Structured extraction:     [PENDING]
Extraction schema:         [PENDING]
Function-planning request: [PENDING]
Plan validation/sanitize:  [PENDING]
Actual tool dispatch:      [PENDING]
Provider disclosure:       [PENDING]
```

### Required runtime evidence

Use one fresh workflow created while a valid key is configured. The evidence must distinguish it from recorded-demo mode:

- `GET /api/health` reports the live provider mode, Qwen model, deployment target, and version, but no credential;
- the workflow's model metadata reports Qwen Cloud/live mode, model, logical call count, latency, and token fields (a normal live workflow should reflect both extraction and function planning);
- the UI visibly labels the run as live Qwen Cloud;
- a terminal or Alibaba Cloud log shows a successful application request and non-secret model metadata;
- no screenshot contains an authorization header, API key, cookie, `.env` contents, or full account credential.

Suggested redacted capture command:

```bash
curl --fail --silent https://YOUR_DOMAIN/api/health
```

Expected **shape** (values are illustrative, not proof):

```json
{
  "status": "ok",
  "service": "grantguard-api",
  "version": "...",
  "deploymentTarget": "alibaba-ecs",
  "timestamp": "...",
  "uptimeSeconds": 123,
  "model": {
    "mode": "live-qwen",
    "provider": "Qwen Cloud",
    "model": "qwen3.7-plus",
    "disclosure": "Qwen Cloud is configured. Successful inference is evidenced per workflow by completed model calls and audit events; deterministic policy remains the final authority."
  },
  "store": {
    "mode": "file",
    "healthy": true
  }
}
```

This health response proves configuration, not a successful invocation. Live-call proof must also show a completed workflow model receipt with non-zero calls plus its Qwen-authored audit events.

Use the application's actual returned schema in the submission. Do not fabricate a field that the endpoint does not expose.

## What proves Alibaba Cloud deployment

The preferred evidence target is an Alibaba Cloud ECS or Simple Application Server instance running the repository's container. A complete evidence set should make both resource ownership and runnable behavior legible.

### Screenshot A - Alibaba Cloud resource

Capture the console page with:

- Alibaba Cloud console chrome visible;
- product name (ECS or Simple Application Server);
- instance/resource name (for example `grantguard-demo`);
- region;
- running/healthy status;
- public IP or bound domain if safe to reveal;
- capture time if the OS/console makes it visible.

Redact account email, billing details, RAM access keys, private network details that are unnecessary, and unrelated resources. Do not crop away the Alibaba Cloud product identity.

Save as:

```text
docs/assets/deployment/alibaba-cloud-resource.png  [PENDING]
```

### Screenshot B - Workbench / terminal on the cloud instance

Capture commands that connect the submitted code to the running service:

```bash
cd /opt/grantguard
git rev-parse HEAD
docker compose -f deploy/ecs/docker-compose.prod.yml ps
curl --fail --silent http://127.0.0.1:8787/api/health
```

The image should show the commit SHA, container health, deployment target, provider mode, model, and service version. It must not show `.env` or `docker inspect` environment values.

Save as:

```text
docs/assets/deployment/alibaba-cloud-runtime.png  [PENDING]
```

### Screenshot C - public application

Capture the browser address bar with HTTPS, the live application, an awaiting-approval proposal, visible Qwen provider badge, risk/diff, and tool/audit evidence.

Save as:

```text
docs/assets/deployment/live-workflow.png  [PENDING]
```

### Optional Screenshot D - Model Studio monitoring

Capture Model Studio invocation monitoring for the same approximate time window, showing model and successful requests. Redact quota/billing/account data as needed. This corroborates live use but does not replace the source and runtime evidence.

Save as:

```text
docs/assets/deployment/model-studio-invocation.png  [PENDING]
```

## Deployment verification runbook

Run these against the exact public candidate:

```bash
# 1. Verify immutable revision on the host
git rev-parse HEAD

# 2. Container should be up and healthy
docker compose -f deploy/ecs/docker-compose.prod.yml ps

# 3. Local service path
curl --fail --silent http://127.0.0.1:8787/api/health

# 4. Public TLS and health
curl --fail --silent --show-error https://YOUR_DOMAIN/api/health

# 5. Frontend should return HTML, not a directory listing or download
curl --fail --silent --show-error https://YOUR_DOMAIN/ | head

# 6. Generate authoritative test/evaluation output
pnpm typecheck
pnpm test
pnpm eval
pnpm build
```

Then manually exercise all three demo stories:

1. valid request -> constrained proposal -> approve -> verified completion;
2. prohibited request -> deterministic deny with no approval/write path;
3. completed request -> rollback -> verified revocation.

Reload each page once to check persisted state and deep-link/static fallback behavior.

## Screenshot and video sanitization

Before publishing, inspect every frame/image for:

- [ ] Model Studio/RAM API keys or partial keys
- [ ] `Authorization` headers
- [ ] cookies, session tokens, QR codes, or password-manager overlays
- [ ] `.env` contents
- [ ] full Alibaba Cloud account/UID where unnecessary
- [ ] billing amount, payment method, or invoice details
- [ ] SSH private keys, host history, or unrelated terminal commands
- [ ] private employee/customer data (fixtures are acceptable)
- [ ] unrelated browser tabs/bookmarks/notifications

If a secret appears even briefly in a recording, rotate it before publishing; blurring the final video is not sufficient if an original public upload or repository history exposed it.

## Public-link QA

After repository and video publication:

- [ ] Open every URL in a signed-out/incognito browser.
- [ ] Repository is public and includes `LICENSE`, README, source, tests, and deployment docs.
- [ ] Permalinks use the submitted commit SHA.
- [ ] Live demo loads without local-network dependencies.
- [ ] Health endpoint contains no secrets or filesystem paths.
- [ ] Demo video is public/unlisted as allowed by the competition and under 3:00.
- [ ] Devpost description does not claim live Qwen for any recorded-demo footage.
- [ ] Architecture image/diagram is legible at Devpost width.
- [ ] All `PENDING`, `YOUR_DOMAIN`, `<owner>`, and `<workspace-id>` placeholders are removed from submitted/public-facing copy where they are meant to be final.

Useful final search:

```bash
rg -n "PENDING|YOUR_DOMAIN|<owner>|<repo>|<workspace-id>|sk-[A-Za-z0-9]" README.md docs deploy
```

Keep `PENDING` text in this evidence workbench only until real evidence exists; it is intentionally honest during development.
