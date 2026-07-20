# GrantGuard architecture

GrantGuard is a human-gated agent system for temporary, least-privilege access changes. Its architecture separates probabilistic interpretation from deterministic authorization and separates authorization from side effects.

## Design principle

```text
Qwen proposes -> policy code constrains -> human authorizes -> sandbox IAM executes -> verifier observes
```

No model response is itself an authorization. The model operates on an allow-listed planning surface; the deterministic policy engine owns hard constraints; and the write adapter is reachable only after a valid server-side approval transition.

![GrantGuard control-flow architecture](../public/architecture.svg)

## System context

```mermaid
flowchart TB
    Requester[Requester or demo operator]
    Approver[Human approver]

    subgraph Browser[Browser - untrusted client]
      Workbench[GrantGuard workbench]
    end

    subgraph Service[GrantGuard Node.js service - trusted application boundary]
      API[Express API]
      Orchestrator[Workflow orchestrator]
      Schema[Zod schema boundary]
      ToolGate[Function allow-list and argument sanitizer]
      Policy[Deterministic policy engine]
      Context[Directory and resource tools]
      IAM[Sandbox IAM adapter]
      Verify[Read-after-write verifier]
      Audit[Hash-linked audit store]
      Static[Vite static assets]
    end

    Qwen[Alibaba Cloud Model Studio - Qwen]

    Requester --> Workbench
    Approver --> Workbench
    Workbench -->|HTTPS JSON| API
    API --> Orchestrator
    API --> Static
    Orchestrator -->|server-side key| Qwen
    Qwen --> Schema
    Schema --> Orchestrator
    Orchestrator -->|function-planning request| Qwen
    Qwen -->|proposed read calls| ToolGate
    ToolGate -->|validated trusted calls| Orchestrator
    Orchestrator --> Context
    Orchestrator --> Policy
    Policy -->|permit with gate| API
    API -->|validated approval| IAM
    IAM --> Verify
    Orchestrator --> Audit
    Policy --> Audit
    IAM --> Audit
    Verify --> Audit
```

## Responsibilities

| Component | Responsibility | Explicitly does not do |
| --- | --- | --- |
| React workbench | Collect request input, visualize plan/diff/traces, capture approval or rejection, request rollback | Hold a Model Studio secret; decide policy |
| Express API | Validate requests, expose workflow transitions, serve production frontend, report non-secret health | Trust client-supplied workflow state |
| Workflow orchestrator | Advance legal states, coordinate Qwen and tools, persist evidence | Override a policy denial |
| Qwen adapter | Extract typed intent and propose directory, resource, current-access, and optional ticket-evidence functions | Execute tools, decide policy, produce the policy explanation, execute IAM writes, or approve itself |
| Zod/tool boundary | Parse structured extraction, allow-list function names, validate arguments, replace identifiers with trusted extracted values, and add omitted mandatory reads | Repair unsafe access intent silently or dispatch model-supplied identifiers directly |
| Context tools | Return fixture identity, current-access, resource, and reference-only ticket facts | Accept arbitrary function names or external URLs; treat a ticket as authorization |
| Policy engine | Apply hard identity/resource/role/action/duration rules and compute outcome/risk | Delegate a hard authorization rule to a prompt |
| Human gate | Record an actor-labeled approval/rejection and note (the prototype does not authenticate that label) | Change a denied plan into an allowed one |
| Sandbox IAM | Apply/revoke a temporary simulated grant with idempotency | Modify a real Alibaba Cloud account |
| Verifier | Read observed state after grant/revoke and compare with expectation | Treat a write response as proof of state |
| Audit store | Append ordered, prior-hash-linked events | Provide immutable external anchoring |

## Request lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor R as Requester
    actor H as Human approver
    participant UI as Workbench
    participant O as Orchestrator
    participant Q as Qwen Cloud
    participant T as Read-only tools
    participant P as Policy engine
    participant I as Sandbox IAM
    participant V as Verifier
    participant A as Audit store

    R->>UI: Submit prose and optional image
    UI->>O: Create workflow
    O->>Q: Extract JSON intent
    Q-->>O: Structured intent
    O->>O: Validate extraction schema
    O->>Q: Request read-only context function plan
    Q-->>O: Proposed directory/resource/access calls
    O->>O: Allow-list, validate, sanitize, add mandatory reads
    O->>T: Dispatch mandatory identity/resource/access reads + selected ticket lookup
    T-->>O: Grounding facts
    O->>P: Evaluate normalized request plus facts
    P-->>O: Deny or constrained proposal
    O->>A: Append model, tool, and policy evidence

    alt deterministic deny
      O-->>UI: Denied with findings
    else approval required
      O-->>UI: Proposed diff, expiry, evidence
      H->>UI: Approve or reject
      UI->>O: Server-side decision transition
      alt rejected
        O->>A: Append rejection
        O-->>UI: Closed as rejected
      else approved
        O->>I: Grant with stable idempotency key
        I-->>O: Sandbox write result
        O->>V: Read observed grant
        V-->>O: Match or mismatch
        O->>A: Append approval, write, verification
        O-->>UI: Completed or failed closed
      end
    end

    opt rollback after completion
      H->>UI: Request rollback
      UI->>O: Roll back workflow
      O->>I: Revoke grant idempotently
      O->>V: Verify absence/revocation
      O->>A: Append revoke and verification
      O-->>UI: Rolled back or failed closed
    end
```

## State machine

```mermaid
stateDiagram-v2
    [*] --> queued
    queued --> extracting
    extracting --> planning: schema-valid extracted intent
    planning --> enriching_context: validate plan and dispatch context reads
    enriching_context --> evaluating_policy
    evaluating_policy --> denied: hard policy deny
    evaluating_policy --> awaiting_approval: compute constrained diff
    awaiting_approval --> rejected: human rejects
    awaiting_approval --> approved: human approves
    approved --> executing
    executing --> verifying
    verifying --> completed: observed equals expected
    extracting --> failed: invalid model output
    planning --> failed: function-planning failure
    enriching_context --> failed: unknown context
    evaluating_policy --> failed: policy or diff failure
    executing --> failed: adapter error
    verifying --> failed: mismatch
    completed --> rolling_back
    rolling_back --> rolled_back: revocation verified
    rolling_back --> failed: revocation mismatch
```

Terminal states are `denied`, `rejected`, `rolled_back`, and `failed`. `completed` is stable but may transition to rollback. State transitions are enforced on the server; a client cannot jump from `queued` to `executing`.

## Data flow and minimization

1. The API accepts request text and optionally an image representation within configured size limits.
2. Qwen receives that untrusted content for structured intent extraction; the returned fields cross a Zod boundary. Enumerated roles, numeric durations, resource IDs, actions, confidence, and source are type-checked.
3. The validated extraction is sent to a second Qwen function-calling step with `directory_lookup`, `resource_lookup`, `access_current`, and optional `ticket_lookup` definitions. Accepted calls are normalized to `directory.lookup`, `resource.lookup`, `access.current`, and `ticket.lookup` traces.
4. The server ignores unknown/duplicate/malformed calls, replaces accepted arguments with validated extracted identifiers, appends any of the three mandatory grounding reads Qwen omitted, and discards `ticket.lookup` unless extraction contains a ticket ID.
5. The orchestrator dispatches those actual reads. Their results and the normalized request, not secrets, enter deterministic policy evaluation.
6. The policy engine emits human-readable findings, a bounded effective role/action set, maximum duration, risk, and outcome; the UI renders those deterministic facts and the computed diff.
7. Only the constrained proposal reaches the human. Only the workflow ID plus approval identity/note returns to the server.
8. The IAM adapter receives the effective proposal, expiry, and idempotency key. It never receives the original prompt.
9. Audit events store operational evidence. A production system should redact/tokenize personal data and define retention before persistence.

## Safety invariants

These conditions must hold regardless of Qwen output:

1. A `deny` decision has no path to `approved` or `executing`.
2. A write requires a recorded human approval for the same workflow revision.
3. The executed role, actions, and expiry equal the policy-constrained values, not the raw request.
4. Unknown/inactive subjects and unknown resources fail closed.
5. Disallowed roles/actions are removed or denied according to deterministic policy.
6. Every grant has an expiry and an idempotency key.
7. Completion requires read-after-write agreement.
8. Rollback completion requires read-after-revoke agreement.
9. Each audit event commits to its predecessor hash.
10. Model/provider mode is disclosed per workflow and in health telemetry.
11. Qwen-selected context functions are not merely displayed: after validation and sanitization, the orchestrator dispatches them before policy evaluation.

The deterministic evaluator and unit/API integration tests collectively target these invariants; see [`evaluation.md`](evaluation.md).

## Live Qwen and recorded-demo modes

```mermaid
flowchart LR
    Start[Server startup] --> Key{DASHSCOPE_API_KEY present?}
    Key -->|yes| Live[Live Qwen adapter]
    Key -->|no| Demo[Deterministic extraction fixture]
    Live --> Boundary[Same schema boundary]
    Demo --> Boundary
    Boundary --> Pipeline[Same dispatched reads, policy, approval, IAM, verification, audit]
```

The fixture replaces only probabilistic extraction and function selection; it emits the same three trusted baseline reads and an optional ticket lookup for ticket-bearing fixtures. It does not bypass dispatch, policy, or the approval gate. The `model.mode`, provider, model name, fallback flag, token/latency fields, and disclosure string make the distinction visible.

## Deployment topology

### Preferred: ECS / Simple Application Server

```mermaid
flowchart LR
    Internet[Public browser] -->|HTTPS 443| Nginx[Nginx on Alibaba Cloud ECS or SAS]
    Nginx -->|HTTP 127.0.0.1:8787| Container[GrantGuard container]
    Container -->|HTTPS| ModelStudio[Alibaba Cloud Model Studio]
    Container --> Volume[(Single-instance audit volume)]
```

One Node.js container serves both frontend and API, avoiding cross-origin credential and routing complexity. Nginx terminates TLS and forwards the original host/protocol. The service binds publicly inside its container but is published only to loopback by the production Compose file.

### Non-deployable experiment: Function Compute custom container

The same image can technically start with `PORT=9000` as a Function Compute `custom-container`, but that does not make the current stateful workflow reliable there. Workflow creation returns before background stages finish; expiry uses process timers; memory is ephemeral; and concurrent requests are not guaranteed to reach the same instance. The checked-in manifest is therefore an architecture experiment only. It must not be used as the live app or deployment evidence without durable jobs, a transactional external store, and verified custom-domain routing.

## Failure handling

| Failure | Behavior |
| --- | --- |
| Primary Qwen timeout/unavailable | Attempt configured fallback once; record fallback metadata. If both fail, stop as `failed`. |
| Invalid or out-of-schema JSON | Reject at schema boundary; no guessed repair enters authorization. |
| Unknown/duplicate tool name or malformed arguments | Reject the proposed call. Missing mandatory context reads are appended from trusted extracted identifiers before dispatch; there is no dynamic dispatch. |
| Missing directory/resource context | Fail closed or deterministic deny. |
| Human rejection | Close as `rejected`; do not call IAM. |
| Duplicate approval/execution request | State guard and idempotency key prevent a duplicate grant. |
| Write succeeds but verification differs | Mark `failed`; do not report completion. Operator can inspect audit and roll back if an observed grant exists. |
| Revoke verification differs | Mark `failed`; do not report rollback success. |
| Audit persistence unavailable | Health becomes degraded; production policy should block writes. |

## Scaling path

The hackathon build intentionally optimizes for inspectability. A production version would replace the file store with a transactional database, use a durable workflow engine/scheduler for expiry, anchor audit digests externally, integrate enterprise IdP/IAM providers, authorize approvers via SSO and RBAC, protect mutations against CSRF/replay, and run multiple stateless API replicas behind a load balancer.
