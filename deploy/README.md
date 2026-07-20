# Deployment guide

GrantGuard builds as one Node.js container. Express serves the Vite frontend and `/api/*`, and only the server calls Alibaba Cloud Model Studio.

## Choose a target

| Target | Use when | Persistence | Public web behavior | Recommendation |
| --- | --- | --- | --- | --- |
| Alibaba Cloud ECS / Simple Application Server | A small Linux VM already exists or can be provisioned | Named Docker volume on the VM | Conventional HTTPS site behind Nginx | **Preferred hackathon deployment** |
| Alibaba Cloud Function Compute custom container | Architecture experiment only | Ephemeral in provided manifest (`AUDIT_STORE=memory`) | Background jobs and cross-request state are not reliable in this design | **Do not use for submission evidence** |
| Local Docker Compose | Rehearsal and smoke testing | Named Docker volume | Loopback only | Development |

Nothing in this directory proves that a cloud deployment exists. Complete [`../docs/deployment-proof.md`](../docs/deployment-proof.md) with real evidence after deploying.

## Build contract

The root [`Dockerfile`](../Dockerfile):

1. installs the lockfile dependencies with pinned pnpm;
2. runs `pnpm build`, producing `dist/` and `dist-server/`;
3. prunes development dependencies;
4. copies only production output and dependencies into an Alpine runtime image;
5. runs as the unprivileged `grantguard` user;
6. starts `node dist-server/server/index.js`;
7. checks `/api/health` on the configured `PORT`.

The server must bind `0.0.0.0`, not loopback, inside the container.

## Local container rehearsal

Create `.env` from `.env.example`. Leaving `DASHSCOPE_API_KEY` empty intentionally selects recorded-demo mode.

```bash
docker compose config
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8787/api/health
docker compose logs --tail=100 grantguard
```

Stop without deleting the named data volume:

```bash
docker compose down
```

Delete the volume only when intentionally resetting demo data:

```bash
docker compose down --volumes
```

## Preferred Alibaba Cloud deployment

Use [`ecs/README.md`](ecs/README.md) for the end-to-end ECS/Simple Application Server runbook. The production file differs from the local file by using a required root `.env`, a read-only filesystem, a persistent volume, log rotation, loopback-only publishing, and a truthful deployment label supplied by that `.env` (`alibaba-ecs` for ECS or `alibaba-sas` for Simple Application Server).

Basic command from the repository root on the instance:

```bash
docker compose -f deploy/ecs/docker-compose.prod.yml config
docker compose -f deploy/ecs/docker-compose.prod.yml up --build -d
curl --fail http://127.0.0.1:8787/api/health
```

Do not paste `docker compose config` output into public evidence: it can contain the resolved API key. A screenshot may show `docker compose ... ps` and the health response.

## Function Compute architecture experiment

[`function-compute/README.md`](function-compute/README.md) documents why the checked-in manifest is not a supported deployment for this release. The current app acknowledges workflow creation before background extraction/planning finishes, schedules expiry in process timers, and uses process-local or single-writer file state. Function Compute can freeze after a response and route later requests to another instance. Keep this manifest experimental until the workflow is backed by durable jobs and a transactional external store; do not use it for the public demo or evidence.

The experiment intentionally uses the memory store because Function Compute writable container storage is ephemeral. NAS alone does not solve multi-instance consistency; redesign around a transactional external store and durable job scheduler before claiming a usable deployment.

## Health and provider evidence

A candidate is not ready until both local and public health checks succeed:

```bash
curl --fail --silent http://127.0.0.1:8787/api/health
curl --fail --silent https://YOUR_DOMAIN/api/health
```

The response should identify the service, version, deployment target, provider mode, and model, and must not contain secrets. A recorded-demo response proves the app is running, but does not prove live Qwen usage. Capture a separate workflow while live Qwen mode is visibly active.

## Secret safety

- Keep `.env` out of Git and set `chmod 600 .env` on the VM.
- Never use a `VITE_*` variable for `DASHSCOPE_API_KEY`.
- Do not put the key directly in Compose, `s.yaml`, shell history, screenshots, or a video.
- Prefer Alibaba Cloud secret management/KMS for production; this hackathon runbook uses an environment file only as a minimal VM path.
- Ensure the Model Studio key and `QWEN_BASE_URL` are from compatible regions.
- Rotate any key that appears in terminal output or screen capture.

## Cost and cleanup

Review current Alibaba Cloud pricing before creating ECS/SAS, ACR, Function Compute, Log Service, DNS, or certificate resources. This repository does not create paid resources automatically. After judging, stop/delete resources you no longer need and delete or rotate the Model Studio API key if it should not remain active.
