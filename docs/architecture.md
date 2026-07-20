# ReleaseProof architecture

ReleaseProof is a proof-carrying data release autopilot for sharing a bounded dataset projection with an external recipient. It separates four concerns that must not collapse into a single model decision:

1. Qwen interprets the ambiguous request and plans evidence reads.
2. Deterministic policy decides whether a safe release manifest exists.
3. A data owner authorizes the exact effective manifest.
4. A sandbox clean-room adapter publishes, observes, and recalls the share.

The product thesis is:

> Every dataset release needs a recall path.

## System context

~~~mermaid
flowchart TB
    Requester[Requester]
    Owner[Data owner]

    subgraph Browser[Browser — untrusted client]
      Workbench[ReleaseProof workbench]
    end

    subgraph Service[ReleaseProof Node.js service — trusted application boundary]
      API[Express API]
      Orchestrator[Workflow orchestrator]
      Schema[Structured-intent schema]
      ToolGate[Read-tool allow-list and argument rebinder]
      Catalogs[Recipient, dataset, agreement, current-share catalogs]
      Policy[Deterministic release policy]
      Manifest[Effective release manifest and diff]
      CleanRoom[Sandbox clean-room adapter]
      Verify[Share and recall verifier]
      Audit[Hash-linked audit store]
      Static[Vite assets]
    end

    Qwen[Qwen Cloud]

    Requester --> Workbench
    Owner --> Workbench
    Workbench -->|HTTPS JSON| API
    API --> Orchestrator
    API --> Static
    Orchestrator -->|server-side key| Qwen
    Qwen --> Schema
    Schema --> Orchestrator
    Orchestrator -->|function-planning request| Qwen
    Qwen -->|proposed read calls| ToolGate
    ToolGate --> Catalogs
    Catalogs --> Policy
    Policy --> Manifest
    Manifest -->|exact proposal| Owner
    Owner -->|approve or reject| API
    API --> CleanRoom
    CleanRoom --> Verify
    Orchestrator --> Audit
    Policy --> Audit
    API --> Audit
    CleanRoom --> Audit
    Verify --> Audit
~~~

The browser never receives the Qwen Cloud API key and cannot assert policy results, legal workflow state, release contents, verification success, or recall success.

## Responsibilities

| Component | Owns | Explicitly does not own |
| --- | --- | --- |
| React workbench | Request input, provider disclosure, manifest/diff/evidence display, owner decision, recall request | Policy, credentials, or authoritative workflow state |
| Express API | Request validation, legal transitions, static app delivery, non-secret health/metrics | Trusting client-supplied release or verification state |
| Workflow orchestrator | Qwen calls, sanitized evidence dispatch, policy handoff, persistence, state progression | Overriding a deterministic denial |
| Qwen adapter | Multimodal/structured release-intent extraction and read-only function planning | Policy, approval, share creation, recall, or proof of provider state |
| Schema/tool boundary | Strict parsing, function allow-list, argument rebinding, mandatory-read completion | Guessing unsafe missing values or dispatching arbitrary model arguments |
| Context catalogs | Synthetic recipient/vendor, dataset, agreement, and current-share facts | Treating requester prose or a ticket reference as authority |
| Policy engine | Recipient verification, dataset classification/tier rules, agreement status/recipient match, purpose presence, action minimization, and TTL caps | Natural-language interpretation, agreement-purpose interpretation, residency enforcement, or side effects |
| Manifest/diff builder | Requested versus effective fields, release tier, destination, expiry, and current-state delta | Expanding scope beyond policy output |
| Data-owner checkpoint | Approve or reject one exact effective manifest revision | Turning a denial into an approval |
| Sandbox clean-room adapter | Idempotent synthetic share creation and recall | Publishing real customer data or enforcing production DLP |
| Verifier | Compare expected and observed share state after create/recall | Treating a successful write response as proof |
| Audit store | Ordered, prior-hash-linked evidence events | Immutable or externally anchored evidence |

## Request lifecycle

~~~mermaid
sequenceDiagram
    autonumber
    actor R as Requester
    actor O as Data owner
    participant UI as Workbench
    participant W as Orchestrator
    participant Q as Qwen Cloud
    participant T as Read-only catalogs
    participant P as Release policy
    participant C as Sandbox clean room
    participant V as Verifier
    participant A as Audit store

    R->>UI: Prose and optional agreement/ticket image
    UI->>W: Create workflow
    W->>Q: Extract recipient, dataset, purpose, fields, TTL
    Q-->>W: Structured release intent
    W->>W: Validate schema
    W->>Q: Request read-only evidence plan
    Q-->>W: Proposed lookup calls
    W->>W: Allow-list, validate, rebind, add mandatory reads
    W->>T: recipient.lookup
    W->>T: dataset.lookup
    W->>T: share.current
    opt Valid agreement reference
      W->>T: agreement.lookup
    end
    T-->>W: Grounded evidence
    W->>P: Intent plus evidence
    P-->>W: Deny or minimized manifest
    W->>A: Model, tool, and policy receipts

    alt Hard denial
      W-->>UI: Denied; no release control
    else Exact manifest can be reviewed
      W-->>UI: Fields, recipient, dataset, expiry, diff, evidence
      O->>UI: Approve or reject exact manifest
      UI->>W: Server-side decision transition
      alt Rejected
        W->>A: Rejection receipt
        W-->>UI: Closed without share
      else Approved
        W->>C: Idempotent share.grant
        C-->>W: Write result
        W->>V: share.verify
        V-->>W: Exact match or mismatch
        W->>A: Approval, release, observed-state receipts
        W-->>UI: Completed only on exact match
      end
    end

    opt Expiry or manual recall after completion
      O->>UI: Recall release
      UI->>W: Recall transition
      W->>C: share.recall
      W->>V: Verify inactive/absent share
      W->>A: Recall and verification receipts
      W-->>UI: Recalled only when observed
    end
~~~

## Public tool vocabulary

Qwen can propose only the first four calls. The remaining calls are server-side traces and are never exposed as model tools.

| Trace | Plane | Purpose |
| --- | --- | --- |
| recipient.lookup | Model-visible read | Resolve the exact external recipient/vendor and verification state |
| dataset.lookup | Model-visible read | Resolve dataset classification, owner, allowed release tiers, and direct-identifier flag |
| share.current | Model-visible read | Inspect active synthetic releases for the same recipient/dataset |
| agreement.lookup | Model-visible optional read | Retrieve reference-only agreement status, owner, and recipient identity |
| policy.evaluate | Server-only decision | Apply deterministic release rules |
| release.diff | Server-only calculation | Compare current share state with the effective manifest |
| share.grant | Server-only write | Idempotently create a sandbox share |
| share.verify | Server-only read-back | Compare observed release state with the approved manifest |
| share.recall | Server-only write | Revoke the synthetic share |

Agreement evidence is necessary where policy requires it but never sufficient by itself. An agreement-shaped identifier in prose cannot create a verified vendor or authorize prohibited fields.

## Data flow and minimization

1. The API accepts bounded request text and an optional bounded image.
2. Qwen receives the untrusted request and returns a narrow typed object containing recipient, dataset, release tier, requested field-actions, duration, purpose/justification, optional agreement reference, confidence, and source mode.
3. The response crosses a schema boundary. Unknown release tiers/actions, malformed identifiers, invalid durations, and incomplete objects fail closed.
4. The validated intent enters a separate function-planning call. The accepted vocabulary is recipient, dataset, current-share, and optional agreement lookup.
5. The server ignores unknown, duplicate, and malformed calls; rebinds accepted identifiers to the validated recipient/dataset/agreement; and appends any mandatory read Qwen omitted.
6. The orchestrator dispatches the reads. Tool receipts, not model assertions, provide vendor status, dataset rules, current release state, and agreement facts.
7. Policy checks recipient eligibility, dataset classification/tier rules, agreement status and recipient match, a non-empty declared purpose, requested field-actions, and TTL. It removes direct identifiers and prohibited exports.
8. A denied request ends. A safe request produces an effective manifest and a before/after diff.
9. Approval targets that effective manifest revision. The adapter never receives the original prompt.
10. The adapter creates a synthetic share with a stable idempotency key and expiry.
11. Verification queries the bound recipient/dataset target and checks that exactly one active share has the expected field-actions, release tier, grant identity, and expiry.
12. Recall reads the state again and succeeds only when the release is inactive or absent.

The public demo uses synthetic identifiers. A production system must minimize and tokenize personal data before model calls and persistence, define retention, and complete a cross-border/privacy review.

## Deterministic release invariants

These conditions hold regardless of Qwen output:

1. An unknown, inactive, or unverified recipient cannot receive a release.
2. An unknown dataset cannot be released.
3. Prohibited export actions such as raw export or consent override cannot reach the write adapter.
4. The effective fields/actions are a subset of both the request and policy-authorized projection.
5. A required agreement must be active and belong to the resolved recipient; it cannot authorize direct identifiers, raw export, or consent override.
6. TTL is finite and does not exceed the policy cap.
7. A denial has no transition to approval or execution.
8. A write requires an approval for the same effective manifest revision.
9. Repeated execution with the same idempotency key cannot create a second active share.
10. Completion requires exact read-after-release agreement.
11. Recall completion requires observed inactive/absent state.
12. Every material transition is appended to the hash-linked audit chain.
13. Provider mode remains visible per workflow and in health telemetry.

## Workflow state machine

The implementation retains generic execution-state names while the UI presents release-domain language.

~~~mermaid
stateDiagram-v2
    [*] --> queued
    queued --> extracting
    extracting --> planning: valid release intent
    planning --> enriching_context: sanitized read plan
    enriching_context --> evaluating_policy
    evaluating_policy --> denied: hard policy denial
    evaluating_policy --> awaiting_approval: effective manifest
    awaiting_approval --> rejected: owner rejects
    awaiting_approval --> approved: owner approves manifest
    approved --> executing: create sandbox share
    executing --> verifying: read observed share
    verifying --> completed: exact match
    extracting --> failed
    planning --> failed
    enriching_context --> failed
    evaluating_policy --> failed
    executing --> failed
    verifying --> failed
    completed --> rolling_back: expiry or recall
    rolling_back --> rolled_back: absence/revocation observed
    rolling_back --> failed: recall mismatch
~~~

Terminal states are denied, rejected, rolled_back, and failed. Completed is stable but recallable.

## Live Qwen and recorded-demo modes

~~~mermaid
flowchart LR
    Start[Server starts] --> Key{DASHSCOPE_API_KEY present?}
    Key -->|yes| Live[Live Qwen adapter]
    Key -->|no| Fixture[Deterministic release fixtures]
    Live --> Boundary[Same schema and read-tool boundary]
    Fixture --> Boundary
    Boundary --> Pipeline[Same catalogs, policy, approval, sandbox release, verify, recall, audit]
~~~

Recorded-demo mode replaces only probabilistic extraction and function selection. It does not bypass release policy or verification. A live provider configuration is not itself proof of a completed Qwen call; each workflow receipt must show successful model calls.

## Deployment topology

### Preferred: Alibaba Cloud ECS or Simple Application Server

~~~mermaid
flowchart LR
    Internet[Public judge browser] -->|HTTPS 443| Nginx
    Nginx -->|HTTP 127.0.0.1:8787| Container[ReleaseProof container]
    Container -->|HTTPS| Qwen[Qwen Cloud]
    Container --> Volume[(Single-instance workflow and audit volume)]
~~~

One container serves frontend and API. Nginx terminates TLS and forwards only to the loopback-published application port. The demo store is suitable for one instance.

### Function Compute experiment

The included Function Compute custom-container manifest is not a submission deployment. Workflow creation acknowledges before background work finishes; expiry uses process timers; memory is ephemeral; and concurrent requests are not guaranteed to reach the same instance. A serverless release requires durable async jobs, a transactional external store, and a verified custom-domain path.

## Failure behavior

| Failure | Behavior |
| --- | --- |
| Primary Qwen timeout | Attempt the configured fallback once; record it; fail if both calls fail |
| Invalid extraction JSON | Stop at schema boundary; do not guess a release |
| Malformed/unknown tool call | Reject it; append trusted mandatory reads only |
| Missing vendor/dataset/agreement facts | Fail closed or deterministic denial |
| Owner rejection | Close without a share |
| Repeated approval/execution | State guard and idempotency prevent duplicate publication |
| Share write succeeds but observation differs | Mark failed; never show completed |
| Recall response succeeds but share remains active | Mark failed; never show recalled |
| Audit persistence is unhealthy | Health degrades; production policy should block writes |
| Process restarts before expiry | Prototype limitation; production needs durable scheduling |

## Production path

The hackathon build optimizes for inspectability, not real-data handling. A production version requires:

- authenticated requesters and authorized dataset owners;
- provider-native clean-room or data-share integration;
- a signed manifest bound to approval and adapter request;
- transactional workflow/idempotency state;
- durable scheduling for expiry and recall;
- field-level lineage, consent, retention, and residency sources;
- KMS-managed secrets and scoped service identities;
- append-only externally anchored audit evidence;
- DLP/classification validation independent of the model;
- privacy, legal, security, and vendor-risk review; and
- failure injection, reconciliation, backup, restore, and incident response.
