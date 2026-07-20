# Alibaba Cloud VM operational notes

For the submission's exact Ubuntu 22.04/24.04, 2 vCPU / 2 GiB Alibaba Cloud Simple Application Server path, use the automated [SAS runbook](../sas/README.md). The SAS scripts are authoritative for environment-file location, Compose invocation, health checks, and evidence capture. This document retains the detailed TLS, backup, update, and cleanup notes.

This is the preferred ReleaseProof deployment because it provides a stable process, persistent single-instance volume, conventional HTTPS behavior, and clear competition evidence.

The public build must use only synthetic recipients, datasets, agreements, and shares. Do not connect it to a real warehouse, DLP, clean room, or customer dataset.

## 1. Provision safely

Use an Alibaba Cloud ECS or Simple Application Server Linux instance with enough memory to build a Node.js container. Start with at least 2 vCPU and 2 GiB RAM unless a smaller size has been tested successfully.

Prefer Singapore or another non-mainland region when no ICP filing already exists. Before purchase:

- inspect the exact current price and taxes in the signed-in checkout;
- confirm region and billing term;
- confirm any free-trial eligibility;
- disable automatic renewal unless continued renewal is intentional; and
- plan to keep the service available through **2026-08-12 05:00 Beijing time**, the end of judging.

Firewall/security group:

- allow TCP 22 only from the operator's IP where possible;
- allow TCP 80 and 443 publicly;
- do not expose TCP 8787 publicly; and
- keep unrelated ports closed.

Create a DNS A record such as **releaseproof.example.com** before obtaining TLS.

## 2. Install prerequisites

Install current Git, Docker Engine, Docker Compose plugin, and Nginx from the distribution's official packages.

~~~bash
git --version
docker --version
docker compose version
nginx -v
~~~

Docker-group membership is effectively root access. Add a deployment user only when that privilege is understood.

## 3. Fetch the exact source

~~~bash
sudo mkdir -p /opt/releaseproof
sudo chown "$USER":"$USER" /opt/releaseproof
git clone https://github.com/xiaodouzi666/releaseproof.git /opt/releaseproof
cd /opt/releaseproof
git checkout PENDING_SUBMITTED_COMMIT_SHA
git rev-parse HEAD
~~~

Replace both pending values. A pinned submitted commit makes the runtime reproducible and produces useful judge evidence.

## 4. Configure server-only environment

~~~bash
sudo install -d -o root -g root -m 0700 /etc/releaseproof
sudo install -o root -g root -m 0600 deploy/sas/releaseproof.env.example /etc/releaseproof/releaseproof.env
sudoedit /etc/releaseproof/releaseproof.env
~~~

Edit the file outside any recording. At minimum:

~~~dotenv
DASHSCOPE_API_KEY=REDACTED_VALUE_SET_ON_HOST_ONLY
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3.7-plus
QWEN_FALLBACK_MODEL=qwen3.6-flash
WORKFLOW_CREATE_LIMIT_PER_MINUTE=1
~~~

Production Compose enforces the port, persistent store path, and immutable truthful `alibaba-sas` deployment label. The environment file supplies only the server-side Qwen settings and runtime limits. Use a workspace-specific Qwen Cloud domain only when the key belongs to the same region/workspace.

The public judge URL is intentionally limited to one new workflow per minute by default. A normal live workflow makes two logical model calls, so also configure Qwen Cloud quota/spend controls.

Never print or capture the environment file. Expanded Compose configuration can expose resolved secrets; use the quiet validation command.

## 5. Validate and start

From **/opt/releaseproof**:

~~~bash
sudo bash deploy/sas/deploy.sh
~~~

The **releaseproof** service should become healthy. Inspect only bounded logs:

~~~bash
sudo docker compose --project-name releaseproof --env-file /etc/releaseproof/releaseproof.env \
  -f deploy/ecs/docker-compose.prod.yml logs --tail=100 releaseproof
~~~

Do not publish logs until they have been checked for request data, vendor/dataset identifiers, and credentials.

## 6. Add HTTPS reverse proxy

Copy [nginx.conf](nginx.conf) to **/etc/nginx/sites-available/releaseproof** and replace every **releaseproof.example.com** with the real domain. Obtain the certificate using the host's approved ACME/Certbot process, then enable the site.

Typical Debian/Ubuntu enablement:

~~~bash
sudo ln -s /etc/nginx/sites-available/releaseproof /etc/nginx/sites-enabled/releaseproof
sudo nginx -t
sudo systemctl reload nginx
~~~

Validate from a separate network or signed-out browser:

~~~bash
curl --fail --silent https://YOUR_DOMAIN/api/health
curl --fail --silent https://YOUR_DOMAIN/ | head
~~~

If the CSP blocks a new external asset, host the asset locally or amend only the necessary directive. Do not remove the entire CSP.

## 7. Optional boot service

The container already uses restart unless stopped. To manage the Compose project with systemd:

~~~bash
sudo cp deploy/ecs/releaseproof.service /etc/systemd/system/releaseproof.service
sudo systemctl daemon-reload
sudo systemctl enable --now releaseproof
sudo systemctl status releaseproof --no-pager
~~~

Confirm **/usr/bin/docker** is the actual binary path before installing the unit.

## 8. Smoke-test the candidate

Run against the submitted commit:

~~~bash
curl --fail --silent http://127.0.0.1:8787/api/health
curl --fail --silent https://YOUR_DOMAIN/api/health
~~~

Then exercise only synthetic built-in scenarios:

- a verified recipient request reaches owner review with a minimized field/action set and finite expiry;
- approval creates one synthetic share and completion appears only after exact read-back;
- a dangerous or unverified-recipient request is denied with no owner/write path;
- a completed share can be recalled and inactive/absent state is verified;
- repeated execution does not create a duplicate share;
- provider mode is accurate and visible;
- page refresh preserves workflows with file storage; and
- no API response/browser asset contains the Qwen key.

Use [docs/deployment-proof.md](../../docs/deployment-proof.md) for capture requirements.

## Update without losing synthetic state

~~~bash
cd /opt/releaseproof
git fetch --all --prune
git checkout NEW_REVIEWED_COMMIT_SHA
sudo bash deploy/sas/deploy.sh
~~~

The named **releaseproof-data** volume survives container replacement. Back it up before any schema-changing update. This prototype has no migration framework.

## Backup and intentional reset

For a hackathon demo, retaining the exact synthetic workflow snapshot may be useful. Stop writes before copying from the volume and inspect the artifact before publication.

To prepare for an intentional reset:

~~~bash
sudo docker compose --project-name releaseproof --env-file /etc/releaseproof/releaseproof.env \
  -f deploy/ecs/docker-compose.prod.yml down
docker volume ls
~~~

Do not delete a volume until its exact resolved name and backup status are verified. The down-with-volumes option is destructive.

## Roll back the application revision

~~~bash
cd /opt/releaseproof
git checkout PREVIOUS_KNOWN_GOOD_COMMIT_SHA
sudo bash deploy/sas/deploy.sh
~~~

Application-revision rollback is separate from ReleaseProof's synthetic data-share recall feature.

## Cleanup after judging

Export only required evidence, then stop/delete paid resources that are no longer needed. Review DNS, certificates, snapshots, container images, logs, and retained synthetic workflow files. Rotate/delete the Qwen Cloud key if it should no longer remain active.
