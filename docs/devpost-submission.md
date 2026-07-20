# Devpost submission copy

This is the final English submission working copy. The narrative sections are ready to paste. Replace every bracketed **PENDING** value with verified public evidence or an explicit legal answer before final submission. Do not publish placeholders or claims that are not visible in the final build.

## Required Devpost fields

| Devpost field | Value to enter |
| --- | --- |
| Submitter type | **[PENDING: Individual, Team, or Organization]** |
| Organization name | Leave blank unless submitter type is Organization |
| Country of residence | **[PENDING: exact country of residence]** |
| New or existing project | **New** |
| Project start date (MM-DD-YY) | **07-20-26** |
| If the project existed before May 26, explain what changed | **Not applicable — ReleaseProof development began on July 20, 2026, during the submission period.** |
| Track | **Track 4 — Autopilot Agent** |
| Public source repository | **https://github.com/xiaodouzi666/releaseproof** |
| Code file showing Qwen Cloud use/base URL | **https://github.com/xiaodouzi666/releaseproof/blob/main/server/qwen.ts** |
| Architecture diagram upload | **public/architecture.png** |
| Alibaba Cloud deployment screenshot upload | **[PENDING: final PNG/JPG/JPEG captured from the deployed Alibaba Cloud resource]** |
| Blog post | Leave blank unless a public build story is published |
| AI tools used | **Qwen Cloud for the application's live structured extraction and read-only function planning; OpenAI Codex for development assistance.** |
| Learning level | **[PENDING: select the entrant's actual level]** |
| Age confirmation | **Check — entrant has confirmed being of legal age in their place of residence.** |
| Eligible-country confirmation | **Check — entrant has confirmed eligibility; verify that the country selected above is allowed before submitting.** |
| Sponsor/affiliate/government-employee confirmation | **[PENDING: entrant must personally confirm the statement before checking]** |
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

- Live application: [PENDING: public HTTPS URL]
- Public source: https://github.com/xiaodouzi666/releaseproof
- Submitted revision: [PENDING: immutable commit permalink]
- Demo video, strictly under 3 minutes: [PENDING: public YouTube URL]
- Qwen integration: https://github.com/xiaodouzi666/releaseproof/blob/main/server/qwen.ts
- Alibaba Cloud deployment evidence: [PENDING: public evidence link plus required Devpost screenshot]

## Testing instructions

Open the public app and first read the provider badge: it distinguishes a completed live-Qwen workflow from the deterministic Recorded Demo mode. Select **Campaign vendor — minimized**, create the request, inspect the recipient/dataset/agreement receipts and requested-versus-effective manifest, approve as the data owner, wait for observed-state verification, and use **Recall now** to verify revocation. Then run **Restricted health — denied** to see a fail-closed path with no approval or release action. All displayed vendors, datasets, agreements, and share records are synthetic.

## Inspiration

> Every dataset release needs a recall path.

An external-data request often starts with a vague sentence: “Send the customer file to Northstar for campaign analysis. They need it this week.”

The dangerous part is everything the sentence leaves out. Which legal recipient? Which governed dataset? Which fields are necessary? Is there an active agreement for that recipient? How long should the share remain live? Who owns the decision? Did the provider expose exactly the approved projection? What happens when consent, purpose, or vendor risk changes tomorrow?

Most release workflows optimize for getting data out. We built ReleaseProof around the other half of the lifecycle: minimizing the release before publication, carrying evidence with it, observing what was actually published, and keeping a verified recall path.

## What it does

ReleaseProof is an operator workbench for controlled external data releases:

1. A requester pastes free-form text or supplies a ticket/agreement image.
2. In live mode, Qwen extracts a typed intent containing recipient, dataset, purpose, requested fields/actions, TTL, and an optional agreement reference.
3. Qwen then proposes a read-only evidence plan over recipient, dataset, current-share, and optional agreement lookup. Recorded Demo mode substitutes disclosed deterministic fixtures for these two model steps.
4. The server allow-lists those functions, validates and rebinds their arguments, adds mandatory reads that Qwen omitted, and dispatches the plan.
5. Deterministic policy evaluates recipient status, dataset classification and allowed tiers, agreement status/recipient match, purpose presence, field-actions, current state, and TTL.
6. Unsafe requests are denied before a write. Safe requests become an effective release manifest with unnecessary fields removed and duration capped.
7. The data owner sees the requested-versus-effective diff, evidence receipts, findings, release tier, and expiry, then approves or rejects that stored effective manifest.
8. Approval creates one idempotent synthetic share in a Sandbox clean-room adapter.
9. ReleaseProof reads the share back and reports completion only when observed recipient, dataset, field-actions, and expiry match the approved manifest.
10. Expiry or manual recall revokes the share and verifies that it is inactive or absent.
11. A prior-hash-linked audit timeline records the model, tool, policy, owner, release, verification, and recall evidence.

The application also exposes provider-mode telemetry and a deterministic release-policy evaluation so judges can distinguish live Qwen behavior from reproducible fixtures.

## How we built it

ReleaseProof is a TypeScript application with a React/Vite workbench and an Express API. The production build ships as one Node.js container: Express serves both the frontend and API, so the Qwen Cloud credential never enters browser code.

The orchestrator advances an explicit server-side state machine. Qwen handles ambiguous, potentially multimodal extraction and evidence planning. A schema/tool boundary treats the model response as untrusted. Synthetic catalogs provide recipient, dataset, agreement, and current-share facts. Deterministic policy produces the effective manifest. A named owner decision gates the write. The Sandbox clean-room adapter provides idempotent share creation and recall, and a separate verifier defines success from observed state.

The preferred deployment is Docker Compose on Alibaba Cloud ECS or Simple Application Server behind Nginx. A checked-in Function Compute manifest is explicitly an architecture experiment, not the submitted live path, because the current background workflow, process timers, and single-instance state need a stable process.

## How Qwen Cloud is used

When the deployment has a working Qwen Cloud entitlement, Qwen is used for the parts that genuinely require language and visual understanding:

- **Multimodal release-intent extraction:** interpret request prose and an optional ticket/agreement image.
- **Structured output:** emit a machine-validated object for recipient, dataset, release tier, field-actions, TTL, purpose, agreement reference, confidence, and source mode.
- **Function planning:** select narrow read-only recipient, dataset, current-share, and optional agreement lookups.
- **Constrained planning boundary:** the server rejects unknown/malformed calls, rebinds arguments to validated identifiers, completes mandatory evidence reads, and dispatches them.
- **Fallback-aware telemetry:** record the selected model, fallback use, calls, latency, and token fields without exposing the API key.

Qwen never receives a share-create, recall, approval, or policy-override tool. Agreement text and model output are evidence inputs, not release authority.

A normal live workflow makes two logical OpenAI-compatible Chat Completions requests to the Qwen Cloud endpoint: structured extraction followed by read-plan generation. The primary model is Qwen 3.7 Plus with Qwen 3.6 Flash as the configurable fallback.

Live-enabled API source: https://github.com/xiaodouzi666/releaseproof/blob/main/server/qwen.ts

Live workflow evidence: [PENDING: public evidence link]

## The proof-carrying manifest

Every reviewable release carries a bounded evidence packet:

- normalized request and provider mode;
- resolved recipient, dataset, agreement, and current-share receipts;
- policy version, findings, and risk;
- requested versus effective fields/actions and TTL;
- the effective manifest displayed for the owner decision;
- idempotency and adapter result;
- expected versus observed share state;
- recall/expiry state; and
- the audit-chain head.

“Proof-carrying” describes inspectable operational evidence, not a formal mathematical proof. The hackathon build retains this packet in a single-instance workflow/audit store. A production version would sign manifests and anchor audit heads externally.

## Architecture

~~~mermaid
flowchart LR
    U[Request text or image] --> Q[Qwen extraction and read plan]
    Q --> B[Schema, allow-list, argument rebinding]
    B --> T[Recipient, dataset, current-share, agreement reads]
    T --> P[Deterministic release policy]
    P --> M[Minimized expiring manifest]
    M --> O{Data-owner decision}
    O -->|approve| C[Sandbox clean-room share]
    O -->|reject| X[No release]
    C --> V[Read-after-release verification]
    V --> R[Expiry or manual recall]
    R --> RV[Read-after-recall verification]
    Q --> A[Hash-linked proof trail]
    T --> A
    P --> A
    O --> A
    C --> A
    V --> A
    R --> A
~~~

Architecture image: [ReleaseProof architecture PNG](../public/architecture.png)

## Challenges we ran into

### Turning ambiguity into a manifest without turning the model into the policy

Recipient names, dataset aliases, purposes, fields, and retention periods arrive in inconsistent prose. Qwen is useful for normalizing that mess, but a plausible model answer cannot establish vendor verification, agreement status, or dataset classification. We split extraction/planning from deterministic release authority and made tool evidence visible.

### Defining “released” from observed state

A successful adapter response does not prove that the intended projection exists. ReleaseProof treats create and recall as small sagas: write idempotently, read provider state, compare it with the approved expectation, and fail closed on mismatch.

### Making recall part of the hero path

Many demos stop at publication. We designed the release record, expiry, operator flow, and audit around reversal from the beginning. The prototype is also explicit about the limit: recalling a share does not retroactively erase data that a recipient already copied.

### Preserving an honest offline demonstration

Recorded-demo mode replaces only Qwen extraction/planning with labeled deterministic fixtures. Policy, owner decision, synthetic share, verification, recall, metrics, and audit still use the same application paths. A fixture is never presented as a live Qwen invocation.

## Accomplishments that we are proud of

- A complete request-to-release-to-recall workflow instead of a publication-only demo.
- Qwen structured extraction and read-plan generation behind a strict schema/tool boundary.
- Deterministic minimization of field-actions and TTL.
- Hard denial for unknown/unverified recipients, plus deterministic removal of dangerous exports and denial when no safe field remains.
- An owner checkpoint tied to the exact effective manifest shown in the UI.
- Idempotent synthetic share creation with read-after-release verification.
- Verified recall based on observed inactive/absent state.
- A proof packet and prior-hash-linked event chain that make every control inspectable.
- Explicit live-Qwen versus recorded-demo disclosure.
- A one-container Alibaba Cloud deployment configuration and documented production gaps.

Local ReleaseProof candidate validation on July 20, 2026: **62/62 automated tests passed and 16/16 deterministic release-policy evaluation cases passed**. These results do not claim a live-Qwen model-quality evaluation. Re-run the commands on the final submitted commit and update this sentence if the result changes.

## What we learned

Data minimization is more useful when it produces an executable projection, not just a warning. Recall is more credible when it is verified, not just scheduled. And model transparency is stronger when the operator can inspect the evidence plan and observed state instead of reading a polished explanation.

We also learned that recall has a hard boundary. Revoking access to a clean-room share is not the same as erasing every downstream copy. A responsible product should reduce raw egress, pair technical controls with contracts and attestations, and communicate that limitation plainly.

## What is real and what is simulated

The workflow orchestration, schema/tool boundary, policy, owner transition, idempotency, verification, recall path, metrics, audit chain, UI, and deployment packaging are implemented.

Recipients, datasets, agreements, and share state are synthetic fixtures. The clean-room adapter does not move real customer data. Destination region, residency enforcement, and semantic agreement-purpose matching are not implemented. ReleaseProof is not a production DLP, consent, legal, or data-governance platform. The provider badge identifies whether a run used live Qwen Cloud or recorded-demo fixtures. Live Qwen and Alibaba Cloud runtime claims remain pending until linked evidence is complete.

## What is next

The next milestone is a read-only enterprise pilot:

1. connect authoritative vendor, contract, dataset, lineage, consent, and residency sources;
2. evaluate Qwen extraction on a consented multilingual text/image corpus;
3. bind authenticated owner approval to a signed canonical manifest;
4. integrate a provider-native clean room without enabling raw egress;
5. add transactional state and durable expiry/recall orchestration;
6. sign and externally anchor audit checkpoints; and
7. enable writes only after privacy, legal, security, and vendor-risk review.

## Built with

- Qwen Cloud
- Qwen 3.7 Plus
- Qwen 3.6 Flash fallback
- Alibaba Cloud Simple Application Server (deployment target; final runtime evidence pending)
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

- replace every PENDING value;
- use the final ReleaseProof thumbnail and architecture image;
- verify the public repository, MIT license, and immutable commit links;
- show the Qwen Cloud base URL and integration source in commit-pinned links;
- show a completed live-Qwen workflow if making a live claim;
- provide the required Alibaba Cloud runtime screenshot;
- keep all demo data synthetic;
- publish a public video strictly under 3:00 and test it signed out;
- open every app/repository/video/evidence link in an incognito window; and
- do not change the submission, repository revision, video, or linked evidence after the deadline.
