# Deployment guide

ReleaseProof builds as one Node.js container. Express serves the Vite frontend and API, and only the server calls Qwen Cloud.

## Choose a target

| Target | Persistence | Public behavior | Recommendation |
| --- | --- | --- | --- |
| Alibaba Cloud Simple Application Server (Ubuntu 22.04/24.04) | Named Docker volume on one VM | Conventional site behind Nginx | **Preferred submission deployment** |
| Alibaba Cloud Function Compute custom container | Ephemeral memory in the provided manifest | Background jobs and cross-request state are unreliable for this design | **Architecture experiment only** |
| Local Docker Compose | Named local volume | Loopback only | Development and rehearsal |

Nothing in this directory proves a cloud deployment exists. Complete [docs/deployment-proof.md](../docs/deployment-proof.md) with real public evidence after deploying.

## Build contract

The root [Dockerfile](../Dockerfile):

1. installs locked dependencies with the pinned pnpm major;
2. builds the Vite frontend and TypeScript server;
3. prunes development dependencies;
4. copies only production output/dependencies into the runtime stage;
5. runs as the unprivileged **releaseproof** user;
6. starts the compiled Express server; and
7. probes the health endpoint on the configured port.

The Express server must bind all interfaces inside the container. Compose publishes it only to host loopback for Nginx.

## Local container rehearsal

Create a local environment file from [.env.example](../.env.example). Leaving **DASHSCOPE_API_KEY** empty intentionally selects recorded-demo mode.

~~~bash
docker compose config --quiet
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8787/api/health
docker compose logs --tail=100 releaseproof
~~~

Stop without deleting the named data volume:

~~~bash
docker compose down
~~~

Delete the volume only when intentionally resetting synthetic demo workflows:

~~~bash
docker compose down --volumes
~~~

## Preferred Alibaba Cloud deployment

Use [sas/README.md](sas/README.md) for the repeatable Ubuntu Simple Application Server runbook. It covers host bootstrap, root-only secret installation, exact-revision deployment, strict health assertions, a real-Qwen smoke test, Nginx, evidence collection, and boot recovery. Production Compose adds:

- required root environment file;
- read-only container filesystem;
- persistent single-instance data volume;
- log rotation;
- loopback-only port publishing;
- process capability drop and no-new-privileges; and
- the immutable truthful deployment label **alibaba-sas**.

From the repository root on the instance:

~~~bash
sudo bash deploy/sas/deploy.sh
sudo bash deploy/sas/install-http-proxy.sh
sudo bash deploy/sas/smoke-live.sh http://127.0.0.1:8787
sudo bash deploy/sas/collect-evidence.sh http://PUBLIC_IPV4
~~~

Do not publish expanded Compose output because it can contain the resolved API key. The evidence collector deliberately captures only whitelisted container properties and non-secret health output.

## Function Compute experiment

[function-compute/README.md](function-compute/README.md) explains why its manifest is not valid submission evidence for the current release. Workflow creation acknowledges before background extraction/planning completes, expiry/recall scheduling uses process timers, and the current store is process-local or single-writer. Function Compute can freeze an instance after a response and route a later request elsewhere.

A production serverless version requires durable async jobs, a transactional store, a durable expiry/recall scheduler, and verified custom-domain behavior. NAS alone does not turn a snapshot writer into a multi-instance database.

## Health and provider evidence

Before publication, both paths must succeed:

~~~bash
curl --fail --silent http://127.0.0.1:8787/api/health
curl --fail --silent https://YOUR_DOMAIN/api/health
~~~

The response should identify the ReleaseProof service, version, deployment target, provider mode, model, and store health without containing secrets. Recorded-demo health proves the container is running; it does not prove a Qwen call. A separate completed workflow must carry the live-model receipt.

## Secret and synthetic-data safety

- Keep the local environment file out of Git and owner-readable only on the VM.
- Never use a Vite-prefixed variable for **DASHSCOPE_API_KEY**.
- Do not place a key directly in Compose, the Function Compute manifest, screenshots, a video, or shell history.
- Prefer Alibaba Cloud secret/KMS services for production.
- Ensure the key and **QWEN_BASE_URL** belong to compatible regions.
- Apply Qwen Cloud quota/spend controls and rotate an exposed key immediately.
- Deploy only synthetic vendor, dataset, agreement, and share fixtures.
- Do not connect the public judge app to a real data warehouse, DLP, clean room, or customer dataset.

## Cost, availability, and cleanup

Review current Alibaba Cloud price, taxes, payment method, region, and auto-renewal before creating any resource. The repository does not create paid resources automatically.

Keep the public application available without charge or restriction through the end of judging. After judging, export only necessary evidence, then stop/delete resources no longer needed and rotate or delete the Qwen Cloud key if it should not remain active.
