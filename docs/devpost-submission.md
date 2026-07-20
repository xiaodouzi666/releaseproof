# Devpost submission copy

This is the final English submission working copy. Public evidence fields are filled with the verified candidate, deployment, and video links. Four entrant-specific answers remain explicitly marked for personal completion; do not infer them or publish claims that are not visible in the final build.

## Required Devpost fields

| Devpost field | Value to enter |
| --- | --- |
| Submitter type | **ENTRANT INPUT REQUIRED — Individual, Team, or Organization** |
| Organization name | Leave blank unless submitter type is Organization |
| Country of residence | **ENTRANT INPUT REQUIRED — exact country of residence** |
| New or existing project | **New** |
| Project start date (MM-DD-YY) | **07-20-26** |
| If the project existed before May 26, explain what changed | **Not applicable — ReleaseProof development began on July 20, 2026, during the submission period.** |
| Track | **Track 4 — Autopilot Agent** |
| Public source repository | **https://github.com/xiaodouzi666/releaseproof** |
| Alibaba Cloud deployment proof code file (field 27543) | **https://github.com/xiaodouzi666/releaseproof/blob/458d7ba55417fac18051156059b4802edeb9f199/server/qwen.ts** — shows the official Qwen Cloud base URL and real API calls, as required by the organizer's Proof of Deployment 101 announcement |
| Alibaba Cloud deployment infrastructure | **https://github.com/xiaodouzi666/releaseproof/blob/458d7ba55417fac18051156059b4802edeb9f199/deploy/ecs/docker-compose.prod.yml#L1-L25** |
| Architecture diagram upload | **public/architecture.png** |
| Alibaba Cloud deployment screenshot upload | **docs/assets/deployment/alibaba-cloud-runtime.jpg**; use **docs/assets/deployment/alibaba-cloud-resource.jpg** as supporting evidence |
| Blog post | Leave blank unless a public build story is published |
| AI tools used | **Qwen Cloud integration for structured extraction and read-only planning (configured on the deployment; successful calls currently blocked by Alibaba account KYC HTTP 403); OpenAI Codex for development assistance.** |
| Learning level | **ENTRANT INPUT REQUIRED — select the entrant's actual level** |
| Age confirmation | **Check — entrant has confirmed being of legal age in their place of residence.** |
| Eligible-country confirmation | **Check — entrant has confirmed eligibility; verify that the country selected above is allowed before submitting.** |
| Sponsor/affiliate/government-employee confirmation | **ENTRANT INPUT REQUIRED — entrant must personally confirm the statement before checking** |
| Testing instructions (optional) | Use the ready-to-paste text under **Testing instructions** below |

Do not infer the remaining entrant answers. The submitter type, exact country, learning level, and sponsor/affiliate/government-employment confirmation must come from the entrant.

## Project name

ReleaseProof

## Tagline

Every dataset release needs a recall path.

## Thumbnail

Upload a final 3:2 ReleaseProof thumbnail in PNG/JPG/JPEG format under Devpost's size limit.

[ReleaseProof 3:2 thumbnail](../public/devpost-thumbnail-3x2.png) — upload the PNG, not the SVG source.

Do not upload the previous access-control artwork.

## Track

Track 4 — Autopilot Agent

## One-line description

ReleaseProof turns an ambiguous external data-sharing request into a minimized, expiring, owner-approved release manifest with observed publication, verified recall, and a proof-carrying audit trail.

**Target users:** enterprise data owners, privacy operations, and data-governance teams that review temporary releases to external vendors.

## Try it out

- Live application: http://8.219.184.228
- Public source: https://github.com/xiaodouzi666/releaseproof
- Submitted revision: https://github.com/xiaodouzi666/releaseproof/commit/458d7ba55417fac18051156059b4802edeb9f199
- Demo video: https://youtu.be/s64eo9D5PYc
- Qwen integration: https://github.com/xiaodouzi666/releaseproof/blob/458d7ba55417fac18051156059b4802edeb9f199/server/qwen.ts
- Alibaba Cloud deployment code: https://github.com/xiaodouzi666/releaseproof/blob/458d7ba55417fac18051156059b4802edeb9f199/deploy/ecs/docker-compose.prod.yml#L1-L25
- Alibaba Cloud deployment evidence: https://github.com/xiaodouzi666/releaseproof/blob/main/docs/deployment-proof.md
- Health endpoint: http://8.219.184.228/api/health

## Testing instructions

Open the public app and health endpoint first. The application is deployed on Alibaba Cloud and the provider badge truthfully shows Qwen Cloud configured with `qwen3.7-plus`, awaiting a successful release run. The health response reports `live-qwen`; this is configuration evidence, not inference evidence. New model-dependent workflows currently fail closed because Alibaba account KYC returns HTTP 403.

For a reproducible end-to-end workflow, check out the submitted revision locally without `DASHSCOPE_API_KEY`, run `pnpm dev`, and use the clearly labeled Recorded Demo mode. Select **Campaign analysis, minimized**, inspect the recipient/dataset/agreement receipts and Requested → Owner-approved effective → Observed proof, approve as the data owner, wait for exact observed-state verification, and use **Recall now** to verify revocation. Then run **Restricted health data blocked** to see a fail-closed path with no approval or release action. All displayed vendors, datasets, agreements, and share records are synthetic; fixture output is not represented as a successful Qwen call.

## Inspiration

Every dataset release needs a recall path.

An external-data request often begins as a vague sentence: “Send the customer file to Northstar for campaign analysis. They need it this week.”

The risk lives in everything that sentence omits. Which legal recipient? Which governed dataset? Which fields are actually necessary? Is there an active agreement? How long should access remain live? Who owns the decision? Did the provider expose exactly what was approved? What happens if consent, purpose, or vendor risk changes tomorrow?

Most release workflows optimize for publication. ReleaseProof treats minimization, observed-state verification, and recallability as parts of the release itself.

## What it does

ReleaseProof is a proof-carrying data release autopilot for temporary external sharing.

Its core contract is:

**Requested → Owner-approved effective → Observed**

1. A requester supplies ambiguous prose or an optional ticket/agreement image.
2. The live Qwen path extracts a typed release intent and proposes narrow, read-only evidence calls.
3. The server validates and rebinds those calls, completes mandatory recipient, dataset, current-share, and agreement reads, and treats all model output as untrusted.
4. Deterministic policy either denies the request or produces the smallest permitted manifest.
5. A data owner reviews and approves that exact effective manifest—not the original prose.
6. A synthetic clean-room adapter creates one idempotent share.
7. ReleaseProof reads provider state back and reports completion only when the observed recipient, dataset, tier, fields, expiry, and unique share identity match the approved expectation.
8. Manual recall or TTL expiry revokes the workflow-created share, followed by read-after-recall verification.
9. Model, tool, policy, owner, release, verification, and recall events are linked in a prior-hash audit chain.

Qwen is never offered a share-create, approval, recall, or policy-override tool. Language-model output is evidence, not authority.

## Counterfactual minimization receipt

ReleaseProof makes minimization inspectable instead of reducing it to a warning.

Before approval, the operator sees a Requested → Effective manifest receipt. It shows the requested release tier, TTL, and every requested field-action beside the deterministic result. Retained fields are marked explicitly. Removed fields carry the policy finding that removed them. If an action is absent without a recognized permission, the release fails closed instead of inferring authority.

For the synthetic campaign scenario, an over-broad request for direct identifiers, raw export, consent override, and 72 hours becomes an owner-reviewable profile release containing only the allowed aggregate/profile actions with an 8-hour TTL.

This receipt is counterfactual evidence: it shows not only what will leave, but what would have left without the control.

## Recall Contract

Recall is visible before approval, not added after publication.

The pre-approval Recall Contract binds:

- the exact recipient and dataset target;
- the manual or TTL trigger;
- the reviewed active-share baseline;
- the success condition for the workflow-created release; and
- the required read-after-recall proof.

A recall command is not considered success. ReleaseProof reports success only after observed state returns to the reviewed baseline—normally zero active matching shares for that workflow-created release.

Recall revokes future synthetic access. It does not claim to erase copies a recipient may already have made.

## How we built it

ReleaseProof is a TypeScript application with a React/Vite workbench and an Express API. The production build ships as one Node.js container, with Express serving both the frontend and API so the Qwen credential never enters browser code.

The backend owns an explicit state machine. Qwen handles the ambiguous interpretation boundary. Zod schemas and an allow-listed tool boundary validate the model response. Synthetic catalogs provide recipient, dataset, agreement, and current-share evidence. Deterministic policy owns authorization. A named owner decision gates the write. The sandbox adapter provides idempotent share creation and targeted recall, while separate verifiers define success from observed state.

The submitted backend is running on Alibaba Cloud Simple Application Server behind Nginx:

http://8.219.184.228

The deployed revision is:

https://github.com/xiaodouzi666/releaseproof/commit/458d7ba55417fac18051156059b4802edeb9f199

## How Qwen Cloud is used

The implemented live path makes two logical OpenAI-compatible Qwen Cloud calls:

- structured release-intent extraction; and
- constrained read-only evidence-plan generation.

The server rejects malformed or unknown calls, rebinds arguments to validated identifiers, adds mandatory evidence reads that the plan omitted, and records provider/model/fallback/call/latency/token metadata without exposing the API key.

Qwen implementation:

https://github.com/xiaodouzi666/releaseproof/blob/458d7ba55417fac18051156059b4802edeb9f199/server/qwen.ts

At submission time, the Alibaba-hosted runtime is configured for Qwen 3.7 Plus and discloses that configuration through its provider badge and health endpoint. However, an account-level Qwen Cloud KYC/entitlement activation gate currently prevents a successful live inference.

We therefore do not present the configured health response as proof of a model call. The public 2:42 video is clearly labeled Recorded Demo. It substitutes deterministic fixtures only for Qwen extraction and read-plan generation; policy, owner approval, synthetic share creation, observed-state verification, recall, metrics, and audit continue through the same application paths.

## Challenges we ran into

### Turning ambiguity into a manifest without turning the model into policy

Recipient names, dataset aliases, purposes, fields, and retention periods arrive in inconsistent prose. Qwen is useful for normalization and evidence planning, but a plausible response cannot establish vendor verification, agreement status, or dataset classification. We separated interpretation from deterministic release authority.

### Defining “released” from reality

A successful write response does not prove that the intended projection exists. ReleaseProof treats create and recall as small sagas: act idempotently, read state back, compare it with the stored expectation, and fail closed on mismatch.

### Making reversal part of the approval decision

Many demos stop at publication. We had to carry exact share identity, baseline state, TTL, recall trigger, and verification criteria through the whole workflow. The Recall Contract makes that exit path reviewable before the owner approves.

### Preserving honest evidence under an external account blocker

The Qwen KYC/entitlement gate remained unresolved while preparing the submission. Rather than disguising a fixture as a successful call, we exposed provider state, retained a clearly labeled Recorded Demo path, and documented the limitation.

## Accomplishments that we are proud of

- A complete request-to-release-to-recall lifecycle.
- A visible Requested → Owner-approved effective → Observed proof model.
- Counterfactual field minimization with deterministic removal reasons.
- A pre-approval Recall Contract with a measurable success condition.
- Qwen structured extraction and read-only planning behind a strict schema/tool boundary.
- Hard denial for unknown, inactive, or unverified recipients and restricted datasets.
- Exact-manifest owner approval.
- Idempotent synthetic share creation.
- Read-after-release and read-after-recall verification.
- A prior-hash-linked audit trail.
- Explicit live-Qwen versus Recorded Demo disclosure.
- A public Alibaba Cloud deployment of the submitted revision.
- 66/66 automated tests and 16/16 deterministic policy evaluation cases passing on the submitted revision.

## What is real and what is simulated

The workflow orchestration, schema/tool boundary, deterministic policy, owner transition, minimization receipt, Recall Contract, idempotency, observed-state verification, recall path, metrics, audit chain, UI, container, and Alibaba Cloud deployment are implemented.

Recipients, datasets, agreements, and share state are synthetic fixtures. The clean-room adapter does not move real customer data. Destination-region enforcement, semantic agreement-purpose matching, authenticated owner identity, and provider-native clean-room integration are not implemented.

ReleaseProof is not a production DLP, privacy, consent, legal-review, or data-governance platform. Its audit chain is tamper-evident, not externally immutable.

## What we learned

Data minimization is more useful when it produces an executable projection rather than a warning.

Approval is not proof. The provider state must be read back.

Recall is more credible when its target, baseline, trigger, and success condition are agreed before release.

And model transparency is stronger when the application shows exactly where the model stops having authority.

## What is next

The next milestone is a read-only enterprise pilot:

1. connect authoritative vendor, contract, dataset, lineage, consent, and residency sources;
2. complete Qwen account activation and evaluate extraction on a consented multilingual text/image corpus;
3. bind authenticated owner approval to a signed canonical manifest;
4. integrate a provider-native clean room without enabling raw egress;
5. add transactional state and durable expiry/recall scheduling;
6. sign and externally anchor audit checkpoints; and
7. enable production writes only after privacy, legal, security, and vendor-risk review.

## Links

- Public app: http://8.219.184.228
- Public source: https://github.com/xiaodouzi666/releaseproof
- Submitted revision: https://github.com/xiaodouzi666/releaseproof/commit/458d7ba55417fac18051156059b4802edeb9f199
- Qwen integration: https://github.com/xiaodouzi666/releaseproof/blob/458d7ba55417fac18051156059b4802edeb9f199/server/qwen.ts
- Alibaba deployment code: https://github.com/xiaodouzi666/releaseproof/blob/458d7ba55417fac18051156059b4802edeb9f199/deploy/ecs/docker-compose.prod.yml
- Architecture: https://github.com/xiaodouzi666/releaseproof/blob/458d7ba55417fac18051156059b4802edeb9f199/public/architecture.png
- Demo video: https://youtu.be/s64eo9D5PYc
- License: MIT

## Built with

- Qwen Cloud
- Qwen 3.7 Plus
- Qwen 3.6 Flash fallback
- Alibaba Cloud Simple Application Server (verified public runtime)
- TypeScript
- React
- Vite
- Express
- Zod
- OpenAI-compatible API client
- Vitest and Supertest
- Docker and Docker Compose
- Nginx

## Submission evidence reminder

Before pasting this copy:

- complete the four **ENTRANT INPUT REQUIRED** answers personally;
- use the final ReleaseProof thumbnail and architecture image;
- verify the public repository, MIT license, and immutable commit links;
- enter the candidate-pinned Qwen Cloud API source permalink (`server/qwen.ts`) for submission field 27543, matching the organizer's Proof of Deployment 101 guidance;
- keep the candidate-pinned Docker Compose deployment link separately available in the Story and deployment documentation;
- do not claim successful live-Qwen inference while the KYC 403 remains unresolved;
- provide the required Alibaba Cloud runtime screenshot;
- keep all demo data synthetic;
- publish a public video strictly under 3:00 and test it signed out;
- open every app/repository/video/evidence link in an incognito window; and
- do not change the submission, repository revision, video, or linked evidence after the deadline.
