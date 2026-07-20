# Alibaba Cloud ECS / Simple Application Server runbook

This is the preferred GrantGuard deployment because it provides conventional browser behavior, a persistent local volume, straightforward TLS, and clear competition evidence.

## 1. Provision safely

Use an Alibaba Cloud ECS or Simple Application Server Linux instance with enough memory to build a Node.js container. For this multi-stage pnpm/Vite/TypeScript build, start with at least 2 vCPU and 2 GiB RAM unless a smaller size has been tested successfully. Prefer Singapore or another non-mainland region when no ICP filing is already available. Before creating anything, inspect the current price and free-tier eligibility in the account, confirm the paid checkout amount, and disable automatic renewal after purchase unless continued renewal is intentional. Keep the instance available through 2026-08-12 05:00 Beijing time for judging.

Security group / firewall:

- allow TCP 22 only from the operator's IP where possible;
- allow TCP 80 and 443 publicly;
- do **not** allow TCP 8787 publicly;
- keep unrelated ports closed.

Create a DNS `A` record such as `grantguard.example.com` pointing to the public IP before obtaining TLS.

## 2. Install prerequisites

Install current Git, Docker Engine, the Docker Compose plugin, and Nginx using the distribution's official packages. Confirm:

```bash
git --version
docker --version
docker compose version
nginx -v
```

Add the deployment user to the Docker group only if that privilege is understood; Docker access is effectively root.

## 3. Fetch the exact source

```bash
sudo mkdir -p /opt/grantguard
sudo chown "$USER":"$USER" /opt/grantguard
git clone PENDING_PUBLIC_REPOSITORY_URL /opt/grantguard
cd /opt/grantguard
git checkout PENDING_SUBMITTED_COMMIT_SHA
git rev-parse HEAD
```

Replace both pending values. Pinning the commit makes the cloud runtime reproducible and produces useful judge evidence.

## 4. Configure the server-only environment

```bash
cp .env.example .env
chmod 600 .env
```

Edit `.env` without screen recording. At minimum, decide whether this is a live-Qwen deployment:

```dotenv
DASHSCOPE_API_KEY=REDACTED_VALUE_SET_ON_HOST_ONLY
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.7-plus
QWEN_FALLBACK_MODEL=qwen3.6-flash
PORT=8787
AUDIT_STORE=file
# Use alibaba-ecs on ECS or alibaba-sas on Simple Application Server.
DEPLOYMENT_TARGET=alibaba-sas
WORKFLOW_CREATE_LIMIT_PER_MINUTE=1
```

The Compose file overrides the correct store path and takes this deployment label from the required root `.env`. Use a workspace-specific Model Studio base URL if provisioned; the key must belong to the same region/workspace.

The public judge URL is intentionally limited to one new workflow per minute by default. Each normal live workflow makes two model calls, so also set Model Studio quota/spend alerts and keep the deployment restricted to synthetic demo data.

Never print or capture `.env`. `docker compose config` expands secrets, so use it for private validation only.

## 5. Validate and start

From `/opt/grantguard`:

```bash
docker compose -f deploy/ecs/docker-compose.prod.yml config --quiet
docker compose -f deploy/ecs/docker-compose.prod.yml build --pull
docker compose -f deploy/ecs/docker-compose.prod.yml up -d
docker compose -f deploy/ecs/docker-compose.prod.yml ps
curl --fail --silent http://127.0.0.1:8787/api/health
```

The service should become `healthy`. Inspect only bounded logs:

```bash
docker compose -f deploy/ecs/docker-compose.prod.yml logs --tail=100 grantguard
```

Do not capture logs publicly until checked for request data and identifiers.

## 6. Add HTTPS reverse proxy

Copy `deploy/ecs/nginx.conf` to `/etc/nginx/sites-available/grantguard` and replace every `grantguard.example.com` with the real domain. Obtain the certificate using the host's approved ACME/Certbot procedure, then enable the HTTPS block/site.

Typical Debian/Ubuntu enablement after the certificate paths exist:

```bash
sudo ln -s /etc/nginx/sites-available/grantguard /etc/nginx/sites-enabled/grantguard
sudo nginx -t
sudo systemctl reload nginx
```

Validate from a separate network or signed-out browser:

```bash
curl --fail --silent https://YOUR_DOMAIN/api/health
curl --fail --silent https://YOUR_DOMAIN/ | head
```

If a strict CSP breaks a newly added external asset, host that asset locally or amend the minimal directive; do not remove the entire CSP without analysis.

## 7. Optional boot service

The container already uses `restart: unless-stopped`. To manage the whole Compose project with systemd:

```bash
sudo cp deploy/ecs/grantguard.service /etc/systemd/system/grantguard.service
sudo systemctl daemon-reload
sudo systemctl enable --now grantguard
sudo systemctl status grantguard --no-pager
```

Verify `/usr/bin/docker` is the actual path before installing the unit.

## 8. Smoke test the candidate

Run on the submitted commit:

```bash
curl --fail --silent http://127.0.0.1:8787/api/health
curl --fail --silent https://YOUR_DOMAIN/api/health
```

Then use the UI to verify:

- a valid scenario reaches `awaiting_approval`, executes once, and completes only after verification;
- a prohibited scenario reaches `denied` with no approval/write control;
- a completed grant can be rolled back and revocation is verified;
- provider mode is accurate and visible;
- refreshing the page preserves workflows when file storage is selected;
- no API response or browser asset contains `DASHSCOPE_API_KEY`.

Use [`../../docs/deployment-proof.md`](../../docs/deployment-proof.md) for capture requirements.

## Updating without losing state

```bash
cd /opt/grantguard
git fetch --all --prune
git checkout NEW_REVIEWED_COMMIT_SHA
docker compose -f deploy/ecs/docker-compose.prod.yml build --pull
docker compose -f deploy/ecs/docker-compose.prod.yml up -d --remove-orphans
docker compose -f deploy/ecs/docker-compose.prod.yml ps
curl --fail --silent http://127.0.0.1:8787/api/health
```

The named `grantguard-data` volume survives container replacement. Back it up before a schema-changing update. The prototype has no migration framework, so inspect release changes first.

## Backup / reset

For a hackathon demo, preserving the exact JSON snapshot may be useful. Stop writes and copy from the volume using an approved, reviewed command. Avoid publishing it because it may contain request/identity data.

To reset intentionally after taking any required evidence:

```bash
docker compose -f deploy/ecs/docker-compose.prod.yml down
docker volume ls | grep grantguard
```

Do not delete a named volume until its exact resolved name and backup status are verified. `docker compose down --volumes` is destructive.

## Rollback the application revision

```bash
cd /opt/grantguard
git checkout PREVIOUS_KNOWN_GOOD_COMMIT_SHA
docker compose -f deploy/ecs/docker-compose.prod.yml up --build -d --remove-orphans
curl --fail --silent http://127.0.0.1:8787/api/health
```

Application revision rollback is separate from the product's IAM-grant rollback feature.

## Cleanup after judging

Export only required evidence, then stop/delete paid resources that are no longer needed. Remove DNS, certificates, snapshots, ACR images, or log resources according to the account's retention plan. Delete/rotate the Model Studio key if it should not remain active.
