# Alibaba Cloud Simple Application Server: repeatable Ubuntu deployment

This is the submission path for one Alibaba Cloud Simple Application Server running Ubuntu 22.04 or 24.04 with 2 vCPU, 2 GiB RAM, and a one-month billing term. The scripts do not create or purchase cloud resources and do not alter the Alibaba Cloud firewall.

The application runs as an unprivileged user in a read-only container. Only Nginx is public. Qwen Cloud credentials remain in a root-owned host file outside the Git checkout and are passed only to the server container at runtime.

## Before connecting

In the Alibaba Cloud console, verify the exact instance, region, price, one-month term, and that auto-renewal is disabled. Select Ubuntu 24.04 LTS when available, otherwise Ubuntu 22.04 LTS. Allow inbound TCP 22 from the operator IP and TCP 80 publicly. Add TCP 443 only after TLS is configured. Never allow TCP 8787 in the cloud firewall.

The commands below assume the submitted repository URL and immutable commit SHA are known:

~~~bash
export RELEASEPROOF_REPOSITORY=https://github.com/xiaodouzi666/releaseproof.git
export RELEASEPROOF_COMMIT=FULL_40_CHARACTER_SUBMITTED_COMMIT_SHA
~~~

Do not put the Qwen key in either variable or in shell history.

## 1. Bootstrap a fresh Ubuntu host

Connect over SSH, clone the exact public source, and run the reviewed bootstrap script:

~~~bash
sudo apt-get update
sudo apt-get install -y git ca-certificates
sudo git clone "$RELEASEPROOF_REPOSITORY" /opt/releaseproof
cd /opt/releaseproof
sudo git checkout --detach "$RELEASEPROOF_COMMIT"
sudo bash deploy/sas/bootstrap-ubuntu.sh
~~~

The bootstrap script accepts only Ubuntu 22.04/24.04, verifies at least 2 vCPU and approximately 2 GiB RAM, installs Docker Engine and the Compose plugin from Docker's signed Ubuntu repository, installs Nginx and jq, enables Docker/Nginx at boot, and creates `/etc/releaseproof` with mode `0700`. If the small server has no active swap, it creates one root-only 2 GiB `/swapfile` to keep the container build reliable.

## 2. Install the server-only Qwen environment

Create the environment file without placing the secret on a command line:

~~~bash
sudo install -o root -g root -m 0600 deploy/sas/releaseproof.env.example /etc/releaseproof/releaseproof.env
sudoedit /etc/releaseproof/releaseproof.env
sudo stat -c '%U %G %a %n' /etc/releaseproof/releaseproof.env
~~~

Paste the Qwen Cloud API key only inside `sudoedit`. Keep `QWEN_BASE_URL` in the same Qwen Cloud region as the key. The expected deployment target is compiled into production Compose as `alibaba-sas`; it cannot be overridden by the environment file.

Do not run `cat`, `grep`, `docker inspect` on container environment variables, `docker compose config` without `--quiet`, or any screen recording while editing the file.

## 3. Build, start, and prove local health

~~~bash
cd /opt/releaseproof
sudo bash deploy/sas/deploy.sh
~~~

The deployment fails closed if the key is missing, duplicated, placeholder-shaped, publicly prefixed, or if the environment file is a symlink, is not owned by root, or has group/other permissions. It also refuses a dirty tracked worktree, validates Compose without printing expanded configuration, builds the exact checked-out revision, waits for Docker health, and asserts:

- service `releaseproof-api` reports `ok`;
- deployment target is `alibaba-sas`;
- model mode/provider are `live-qwen` / `Qwen Cloud`; and
- the persistent file store is healthy.

Health proves runtime configuration, not a successful inference. Once the Qwen account is entitled to inference, the next smoke test proves real Qwen calls; HTTP 403 `AccessDenied.Unpurchased` or any other entitlement/KYC failure stops the test closed.

## 4. Add the public HTTP entry point

For a time-limited IP-based judging URL:

~~~bash
sudo bash deploy/sas/install-http-proxy.sh
curl --fail --silent http://127.0.0.1/api/health | jq .
curl --fail --silent http://PUBLIC_IPV4/api/health | jq .
~~~

The script removes Ubuntu's default Nginx site, installs `nginx-http.conf`, validates Nginx, and proxies port 80 to the loopback-only application port. Confirm Alibaba Cloud's server firewall permits inbound TCP 80.

HTTP is provided only so an IP address can be tested immediately. For a durable public deployment, point a domain at the server, use the TLS template at `deploy/ecs/nginx.conf`, obtain an ACME certificate, run `sudo nginx -t`, and reload Nginx. Do not claim HTTPS until the public certificate path has been verified.

## 5. Prove real Qwen inference

This intentionally creates one custom synthetic campaign workflow and consumes Qwen tokens. It has no preset `scenarioId`, so a live-key server must use Qwen rather than recorded fixtures. The smoke test stops at the policy decision and never approves or releases data:

~~~bash
cd /opt/releaseproof
sudo bash deploy/sas/smoke-live.sh http://127.0.0.1:8787 | sudo tee /tmp/releaseproof-live-qwen.json >/dev/null
sudo jq . /tmp/releaseproof-live-qwen.json
~~~

The script accepts either a safe `awaiting_approval` decision or a deterministic `denied` decision, and requires at least two completed live Qwen calls plus two hash-linked Qwen audit events. A 403, invalid output, recorded-fixture fallback, timeout, workflow error, or unexpected terminal state fails the command.

## 6. Collect non-secret evidence

~~~bash
cd /opt/releaseproof
sudo RELEASEPROOF_EVIDENCE_DIR=/tmp/releaseproof-evidence \
  bash deploy/sas/collect-evidence.sh http://PUBLIC_IPV4
sudo cp /tmp/releaseproof-live-qwen.json /tmp/releaseproof-evidence/
sudo bash -c 'cd /tmp/releaseproof-evidence && find . -maxdepth 1 -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS'
sudo find /tmp/releaseproof-evidence -maxdepth 1 -type f -printf '%f\n'
~~~

The collector records the submitted Git revision, OS/runtime versions, Compose status, a whitelisted Docker inspection view, local/public health, public headers, and SHA-256 hashes. It intentionally excludes the server environment, container environment, logs, and request payloads. Inspect every artifact before using it in a screenshot or submission.

Expected evidence files include:

- `deployment-metadata.txt`
- `compose-ps.txt`
- `container-inspect-sanitized.json`
- `health-local.json`
- `health-public.json`
- `public-response-headers.txt`
- `releaseproof-live-qwen.json`
- `SHA256SUMS`

## 7. Enable restart at boot

Only after the deployment passes:

~~~bash
sudo install -o root -g root -m 0644 deploy/ecs/releaseproof.service /etc/systemd/system/releaseproof.service
sudo systemctl daemon-reload
sudo systemctl enable --now releaseproof.service
sudo systemctl status releaseproof.service --no-pager
sudo bash deploy/sas/healthcheck.sh
~~~

The unit uses the same fixed project name, Compose file, and root-only environment file as the deployment script.

## Update or roll back

Pin the next reviewed commit before rebuilding:

~~~bash
cd /opt/releaseproof
sudo git fetch --all --prune
sudo git checkout --detach NEW_FULL_COMMIT_SHA
sudo bash deploy/sas/deploy.sh
~~~

To roll back, substitute the previous known-good full SHA and run the same deployment command. The named `releaseproof_releaseproof-data` volume survives replacement. Do not use `down --volumes`; that destroys the synthetic audit store.

## Remaining external dependencies

- an already purchased Alibaba Cloud Simple Application Server and its public IPv4 address;
- console firewall rules for SSH and HTTP/HTTPS;
- a public Git repository and immutable submitted commit SHA;
- a Qwen Cloud key with successful inference quota/permissions; and
- optionally, a domain and ACME certificate for HTTPS.

After judging, preserve only required evidence, delete the paid server if it is no longer needed, and rotate/delete the temporary Qwen key.
