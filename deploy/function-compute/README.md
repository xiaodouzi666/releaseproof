# Function Compute custom-container experiment

This directory is an architecture experiment, not a supported GrantGuard deployment and not a submission-evidence path. Use the ECS/SAS runbook for the live app.

The current service returns `202` before extraction, tool planning, and policy finish; schedules execution/expiry work with in-process timers; and persists state in memory or a single-writer local snapshot. Function Compute may freeze an instance after the response and route later requests to a different instance. With `AUDIT_STORE=memory` and concurrency above one, workflows can disappear or diverge. A correct serverless design needs durable async jobs, a transactional external store, and a verified custom domain before this manifest can be promoted.

Why the limitation is explicit:

- writable container storage is ephemeral, so the manifest selects `AUDIT_STORE=memory`;
- generated Function Compute URL behavior for a single-page application must be tested in the target account;
- the current background workflow and local-state design is not reliable on Function Compute;
- cold starts and image pull time can affect a short demo;
- the project's audit/workflow store is intentionally single-instance and is not safe across scaled workers.

Do not claim durable persistence or a verified live URL until those behaviors are observed.

## Prerequisites

- Alibaba Cloud account and Serverless Devs credentials configured under access alias `default`;
- Function Compute and Alibaba Cloud Container Registry access;
- an ACR Personal or Enterprise repository in the **same account and region** as the function;
- Docker/BuildKit capable of producing Linux/AMD64;
- a Model Studio key for live Qwen, from a region compatible with `QWEN_BASE_URL`.

Official constraints: Function Compute custom containers must expose an HTTP server on `0.0.0.0:CAPort`, start within the platform window, and currently use AMD64 images. See [Alibaba Cloud custom-container documentation](https://www.alibabacloud.com/help/en/functioncompute/fc/custom-container/).

## Build and push the image

Set values without recording the terminal:

```bash
export ALIBABA_CLOUD_REGION=ap-southeast-1
export ACR_NAMESPACE=YOUR_NAMESPACE
export ACR_REPOSITORY=grantguard
export GRANTGUARD_IMAGE_TAG=SUBMITTED_COMMIT_SHORT_SHA
export IMAGE_NAME="registry.${ALIBABA_CLOUD_REGION}.aliyuncs.com/${ACR_NAMESPACE}/${ACR_REPOSITORY}:${GRANTGUARD_IMAGE_TAG}"
```

Authenticate to the specific ACR registry using Alibaba Cloud's credential flow, then:

```bash
docker build --platform linux/amd64 -t "$IMAGE_NAME" .
docker inspect "$IMAGE_NAME" --format '{{.Architecture}}'
docker push "$IMAGE_NAME"
```

The inspection must print `amd64`.

## Experimental preview only

Export the Model Studio key only in the private deployment environment; do not paste it into `s.yaml`:

```bash
export DASHSCOPE_API_KEY=REDACTED_SET_PRIVATELY
export QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
s preview -t deploy/function-compute/s.yaml
s deploy -t deploy/function-compute/s.yaml
```

`s preview` can render secret values. Do not screenshot, log, or publish its output. The manifest uses `${env('DASHSCOPE_API_KEY')}` so the key is not committed.

The experiment creates an anonymous HTTP trigger. Do not use that trigger as the hackathon live app or expose it to real identities/resources. A future implementation must add durable orchestration, transactional state, and real authentication/authorization before public use.

## Verify

Use the URL returned by Serverless Devs:

```bash
curl --fail --silent https://FUNCTION_URL/api/health
curl --fail --silent https://FUNCTION_URL/api/evaluation
```

Then test one workflow in the client or with the deployed API. Confirm:

- provider mode matches whether a real key was injected;
- `deploymentTarget` identifies Function Compute;
- the model field is correct;
- health contains no secret;
- the service can call Model Studio over the public network;
- the URL returns expected JSON/HTML headers rather than forcing an unintended file download;
- cold-start latency is acceptable for the demo;
- state loss after instance recycling is understood and not represented as persistence.

## Health check

The manifest sets custom-container port `9000` and probes `/api/health` after a five-second initial delay. The Docker command reads `PORT=9000` and starts `dist-server/server/index.js`; the Express server must bind `0.0.0.0`.

## Persistence upgrade

Do not point multiple Function Compute instances at a local JSON file. Replace the current store with a transactional managed database, or mount/configure a supported persistent service and add concurrency controls. NAS alone does not make the existing snapshot writer a multi-writer database.

## Cleanup

After evidence is captured and judging is complete, use Serverless Devs to remove the function if it is no longer needed, then separately review ACR images and any log resources. Deletion can be destructive and may affect a public demo link; confirm judging/evidence status first.
