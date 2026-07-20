# Function Compute custom-container experiment

This directory is an architecture experiment, not a supported ReleaseProof deployment and not a submission-evidence path. Use the ECS/Simple Application Server runbook for the live application.

The current service acknowledges workflow creation before extraction, evidence planning, and policy finish; schedules workflow/expiry work with process timers; and persists state in memory or a single-writer snapshot. Function Compute may freeze an instance after the response and route a later request to another instance. With memory storage and concurrency above one, workflows can disappear or diverge.

A correct serverless design requires durable async jobs, a transactional workflow/idempotency store, and durable expiry/recall scheduling before this manifest can be promoted.

The limitation is explicit:

- writable container storage is ephemeral, so the manifest selects memory storage;
- generated Function Compute URL behavior for a single-page app must be tested in the target account;
- background release/recall workflows and local state are unreliable across freeze/recycle;
- cold starts and image-pull time can harm a short judge demo; and
- the audit/workflow store is intentionally single-instance and not safe across scaled workers.

Do not claim durable persistence, a verified public app, or reliable expiry/recall from this manifest.

## Prerequisites

- Alibaba Cloud account and Serverless Devs credentials under access alias **default**;
- Function Compute and Alibaba Cloud Container Registry access;
- an ACR repository in the same account and region as the function;
- Docker/BuildKit capable of Linux/AMD64 output; and
- a Qwen Cloud key compatible with the configured base URL for live mode.

Function Compute custom containers must expose an HTTP server on all interfaces at the configured container port, start within the platform window, and use a supported image architecture. See [Alibaba Cloud custom-container documentation](https://www.alibabacloud.com/help/en/functioncompute/fc/custom-container/).

## Build and push

Set non-secret values:

~~~bash
export ALIBABA_CLOUD_REGION=ap-southeast-1
export ACR_NAMESPACE=YOUR_NAMESPACE
export ACR_REPOSITORY=releaseproof
export RELEASEPROOF_IMAGE_TAG=SUBMITTED_COMMIT_SHORT_SHA
export IMAGE_NAME="registry.$ALIBABA_CLOUD_REGION.aliyuncs.com/$ACR_NAMESPACE/$ACR_REPOSITORY:$RELEASEPROOF_IMAGE_TAG"
~~~

Authenticate to the exact registry, then:

~~~bash
docker build --platform linux/amd64 -t "$IMAGE_NAME" .
docker inspect "$IMAGE_NAME" --format '{{.Architecture}}'
docker push "$IMAGE_NAME"
~~~

Confirm the inspected architecture matches the platform requirement.

## Experimental preview only

Inject the model key only from the private deployment environment:

~~~bash
export DASHSCOPE_API_KEY=REDACTED_SET_PRIVATELY
export QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
s preview -t deploy/function-compute/s.yaml
s deploy -t deploy/function-compute/s.yaml
~~~

Preview output can render secret values. Do not screenshot, log, or publish it. The manifest reads the key from the process environment so no credential is committed.

The experiment creates an anonymous HTTP trigger. Use only synthetic recipient/dataset/agreement fixtures. Never connect it to a real data source or external clean room.

## Verify experimental behavior

Use the returned URL:

~~~bash
curl --fail --silent https://FUNCTION_URL/api/health
curl --fail --silent https://FUNCTION_URL/api/evaluation
~~~

Confirm:

- provider mode reflects whether a real key was injected;
- deployment target identifies Function Compute;
- the health service is ReleaseProof and exposes no secret;
- Qwen Cloud is reachable from the runtime;
- the URL serves expected JSON/HTML rather than an unintended download;
- cold-start latency is understood; and
- state loss after recycle is not represented as persistence or verified recall.

## Health check

The manifest sets custom-container port 9000 and probes the health endpoint. The image command reads **PORT=9000** and starts the compiled Express server, which must bind all interfaces inside the container.

## Persistence upgrade

Do not point multiple Function Compute instances at a local JSON file. Replace the store with a transactional managed database and use durable jobs/scheduling for extraction, evidence reads, publication, verification, expiry, and recall. NAS alone does not make the current snapshot writer safe for multiple writers.

## Cleanup

After experimentation, remove the function if it is no longer needed, then separately review ACR images and log resources. Deletion can invalidate a public link; confirm judging and evidence status first.
