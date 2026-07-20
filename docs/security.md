# Security, privacy, and threat analysis

ReleaseProof is a security-oriented data-release prototype, not a production DLP, privacy, consent, legal-review, or clean-room service. It uses synthetic recipients, datasets, agreements, and shares. The sandbox adapter must never be represented as a real external data publication.

Its central safety goal is narrower and testable: untrusted request text or model output must not create a broader, longer, or unrecallable release than deterministic policy and the data owner approved.

## Security objectives

1. Qwen, a requester, or the browser cannot bypass deterministic release policy.
2. Unknown, inactive, or unverified recipients cannot receive a share.
3. Prohibited actions such as raw export or consent override cannot reach the adapter.
4. Effective fields/actions and TTL never exceed the policy-constrained manifest.
5. A share write requires data-owner approval for the same manifest revision.
6. Duplicate requests do not create duplicate active shares.
7. Success is based on observed share state, not a write acknowledgement.
8. Recall succeeds only when inactive/absent state is observed.
9. Every material event is actor-labeled and prior-hash-linked; public-demo actor labels are not authenticated identities.
10. Qwen credentials remain server-side.
11. Recorded-demo mode is never presented as live Qwen evidence.

## Assets

| Asset | Why it matters |
| --- | --- |
| Qwen Cloud API key | Authorizes model requests and consumes account quota |
| Release request | May contain recipient, dataset, purpose, agreement, geography, and business context |
| Vendor/recipient catalog | Establishes the resolved counterparty and verification state |
| Dataset catalog | Defines owner, classification, allowed release tiers, and whether direct identifiers are present |
| Agreement evidence | Supplies reference-only status, owner, and recipient identity |
| Effective release manifest | Defines the recipient/dataset target, release tier, fields, declared purpose, and expiry |
| Data-owner decision | Establishes accountability for one manifest revision |
| Sandbox clean-room state | Represents active/recalled synthetic shares |
| Audit chain and proof packet | Supports investigation and carries control evidence |
| Policy implementation/version | Defines the authoritative release boundary |

## Trust boundaries

~~~mermaid
flowchart LR
    subgraph U[Untrusted]
      Browser[Browser]
      Input[Request text and image]
      Model[Qwen output and proposed arguments]
    end

    subgraph T[Trusted application boundary]
      API[Validated API]
      Schema[Schema and tool allow-list]
      Catalog[Trusted synthetic catalogs]
      Policy[Deterministic release policy]
      Owner[Server-side owner decision state]
      Adapter[Sandbox clean-room adapter]
      Verify[Observed-state verifier]
      Audit[Audit store]
    end

    subgraph E[External]
      Qwen[Qwen Cloud]
    end

    Browser --> API
    Input --> API
    API --> Qwen
    Qwen --> Model
    Model --> Schema
    Schema --> Catalog
    Catalog --> Policy
    Policy --> Owner
    Owner --> Adapter
    Adapter --> Verify
    API --> Audit
    Policy --> Audit
    Adapter --> Audit
    Verify --> Audit
~~~

Requester prose, attachment text, Qwen output, browser state, and client-supplied labels are untrusted. Catalog fixtures are trusted only for the synthetic demo; they are not evidence about real vendors, contracts, datasets, consent, or law.

## Threats and controls

| Threat | Example | Prototype control | Residual risk / production work |
| --- | --- | --- | --- |
| Prompt injection | An agreement image says to ignore policy and export raw rows | Qwen sees only four read functions; calls are allow-listed/rebound; policy and write adapter sit outside the model loop | Adversarial multimodal corpus, attachment provenance, OCR isolation, stricter budgets |
| Recipient substitution | Request names a familiar brand but supplies a different vendor account | Recipient lookup resolves a catalog identity; mismatches/unknowns fail closed | Authoritative vendor master, verified destination identity, signed onboarding |
| Model hallucination | Qwen invents a dataset, fields, or agreement | Strict schema plus catalog/agreement reads; unknown facts do not become authority | Field-level provenance, confidence thresholds, human correction flow |
| Agreement laundering | A ticket-shaped ID is presented as permission | Agreement lookup is reference evidence only; policy checks active status and exact recipient match | Contract-system integration, purpose/field-scope metadata, and legal-policy review |
| Overbroad export | Request asks for raw rows, emails, phones, or consent override | Allow-listed actions plus deterministic removal/denial; exact effective manifest shown | Independent DLP scan and schema-level enforcement at provider |
| Purpose drift | Marketing request is later used for model training | A concrete declared purpose is required and shown to the owner; this prototype does not semantically bind it to agreement scope | Agreement-purpose taxonomy, provider usage controls, monitoring, downstream attestations, legal enforcement |
| Residency violation | EU-restricted data is sent to an unsupported location | Not implemented: destination region is not a structured field or policy input in this prototype | Add requested destination, authoritative residency metadata, policy rules, and destination-side enforcement before real use |
| Excessive retention | Request asks for indefinite access | Finite TTL with policy cap; expiry pre-authorizes recall | Durable scheduler, provider-native TTL, alerting and reconciliation |
| Approval bypass | Client posts directly to execution or changes UI state | Server-side legal transitions; write reachable only after an approved manifest | SSO, owner authorization, manifest signature, CSRF/replay controls |
| Approval race / stale manifest | Evidence changes after an owner approves | Workflow revision/state guards and read-back verification | Re-resolve evidence immediately before write; bind approval to canonical manifest hash |
| Replay / duplicate share | Network retry creates a second release | Stable idempotency key and state guard | Transactional provider idempotency ledger and replay window |
| Partial publication | Adapter returns success after publishing the wrong projection | Read-after-release compares observed state with the manifest | Provider-native schema checks and compensating recall automation |
| False recall success | Revoke returns success while the share remains active | Read-after-recall verification | Secondary reconciliation, paging, and incident escalation |
| Link forwarding / recipient compromise | Correct vendor forwards or leaks the released data | Prototype does not claim downstream-use control | Clean-room query controls, watermarking, egress monitoring, contractual controls |
| Audit tampering | Local evidence file is edited or replaced | Each event commits to canonical content and previous hash | KMS signatures, WORM storage, independent timestamp/anchor |
| Credential disclosure | API key appears in frontend, logs, screenshot, or video | Server-only environment variable; no Vite secret; documented capture rules | Secret manager, rotation, scoped credentials, log redaction |
| Sensitive prompt retention | Real dataset names or personal details enter model/audit logs | Demo uses synthetic data and bounded payloads | Data minimization, tokenization, retention controls, regional/legal review |
| Anonymous cost abuse | Public users exhaust Qwen quota | Request/image limits, process rate cap, concurrency queue, upstream timeout, Nginx limits | Authentication, distributed quotas, daily spend cap, circuit breaker |
| File-store race/loss | Multiple instances write one JSON snapshot | Single-instance deployment is explicit | Transactional database, locking, backups, restore testing |
| Supply-chain compromise | Dependency or base image is altered | Lockfile, multi-stage image, non-root runtime | Digest pinning, SBOM, signatures, SAST/dependency/container scanning |
| Cross-site request forgery | Signed-in owner is induced to approve/recall | No production authentication is claimed | SameSite session, CSRF token, Origin checks, step-up auth |
| Cross-site scripting | Request/model text includes markup | React escapes text by default; Nginx CSP | No raw HTML, sanitization for future rich text, security testing |

## Prompt-injection containment

Request text and images are data even when they contain instructions.

1. The extraction prompt treats embedded instructions as untrusted release content.
2. Output must match a narrow schema for recipient, dataset, release tier, requested actions/fields, duration, purpose, optional agreement reference, confidence, and source mode.
3. The function-planning call exposes only recipient lookup, dataset lookup, current-share lookup, and optional agreement lookup.
4. The server rejects unknown, duplicate, and malformed calls.
5. Accepted call arguments are rebound to validated extraction values; the model cannot redirect a lookup to a different vendor or dataset.
6. Mandatory recipient, dataset, and current-share reads are completed even if Qwen omits them.
7. Agreement lookup is accepted only for a validated agreement reference and never grants authority on its own.
8. Deterministic policy computes the effective projection and TTL from grounded facts.
9. The data owner sees the exact manifest and evidence.
10. The sandbox adapter receives only policy-effective values after a legal approval transition.

A successful injection could still degrade extraction or evidence selection. It should not expand the release envelope. Production assurance requires a larger text/image red-team corpus and provider-side enforcement.

## Release-policy and approval invariants

Before a share write, the server should establish atomically:

- workflow state is approved;
- the policy outcome is not deny;
- recipient and dataset are resolved and eligible;
- the recipient is verified and active;
- agreement evidence is present and valid where required;
- the request contains a concrete declared purpose;
- a required agreement is active and belongs to the resolved recipient;
- every effective action/field is explicitly authorized;
- prohibited raw export and consent override actions are absent;
- expiry exists, is in the future, and is within the policy cap;
- approval targets the canonical effective manifest revision;
- the idempotency key is stable for that revision;
- no active share already exists for the same key; and
- audit persistence is healthy enough to record the transition.

The hackathon prototype may not yet authenticate the owner label or cryptographically bind approval to a canonical manifest. Both are required before a real adapter.

## Proof-carrying release scope

The phrase proof-carrying does not mean a formal mathematical proof. It means each workflow retains a bounded evidence packet that lets an operator reconstruct why a particular projection was allowed and whether it was actually observed.

The packet should include:

- normalized intent and provider mode;
- tool inputs/outputs and timestamps;
- resolved recipient, dataset, agreement, and current-share evidence;
- policy version, outcome, risk, constraints, and findings;
- requested and effective manifests;
- data-owner decision and manifest revision;
- idempotency key and adapter result;
- expected versus observed share state;
- recall/expiry evidence; and
- audit-chain head.

Production evidence should be signed, independently anchored, access-controlled, retention-bounded, and exportable for audit.

## Secret handling

- Keep **DASHSCOPE_API_KEY** only in the server process environment.
- Never prefix it with **VITE_**.
- Never commit the local environment file or paste keys into screenshots, videos, logs, or Devpost fields.
- On a demo VM, restrict the environment file to the deployment user.
- Prefer Alibaba Cloud secret management/KMS for a real service.
- Use a key compatible with the configured Qwen Cloud base URL and apply quota/spend controls.
- Rotate any key that appears in a terminal recording, browser capture, log, or repository history.

## Audit-chain limits

The previous-hash chain detects editing, insertion, deletion, or reordering when validated from a trusted chain head. It does not stop an administrator from replacing the entire file and recomputing every hash.

A production design should periodically sign the chain head with KMS and write it to an append-only/WORM destination. Audit payloads must exclude API keys, authorization headers, raw credentials, unnecessary image payloads, and unnecessary personal data.

## Data lifecycle

The public build must use only synthetic vendors, datasets, agreements, and records. Before any real data is introduced, define:

- lawful basis, consent, contract, and approved purposes;
- dataset ownership and classification;
- field-level lineage and permitted projection;
- fields sent to Qwen and the selected processing region;
- cross-border and data-residency requirements;
- recipient verification and destination controls;
- encryption in transit/at rest;
- access controls for manifests and evidence;
- release, expiry, recall, and downstream deletion semantics;
- retention for requests, manifests, and audit records;
- subject-rights, incident, and breach workflows; and
- subprocessors and vendor-risk ownership.

Recall cannot undo a recipient's prior copying or use. The UI and submission must not imply that revoking a share guarantees deletion of already exported data. A real clean-room integration should minimize or prohibit raw egress and provide destination-side controls and attestations.

## Production-readiness gate

Do not connect ReleaseProof to real customer data or a real external-share provider until all items are complete:

- [ ] SSO for requesters and data owners
- [ ] Owner authorization, separation of duties, and step-up authentication
- [ ] Canonical manifest hash bound to approval
- [ ] CSRF, replay, and distributed rate/spend controls
- [ ] Transactional workflow, idempotency, and outbox state
- [ ] Durable expiry/recall scheduler and reconciliation alerts
- [ ] Authoritative vendor, agreement, dataset, lineage, consent, and residency sources
- [ ] Independent DLP/classification validation
- [ ] Provider-native least-privilege service identity
- [ ] KMS/secret-manager integration and rotation
- [ ] Signed, append-only, externally anchored audit evidence
- [ ] Encryption, retention, deletion, and access-review policies
- [ ] Privacy, legal, security, and vendor-risk approval
- [ ] SAST/dependency/container scanning and penetration testing
- [ ] Failure injection, backup/restore, recall, and incident exercises

## Responsible demo guidance

- Always call the mutation target **Sandbox clean room** or **synthetic share**.
- Never claim ReleaseProof moved, anonymized, deleted, or recalled real data.
- Keep the live-Qwen or recorded-demo badge visible.
- Use synthetic recipient emails, datasets, agreements, and fields.
- Explain that recall revokes the simulated share; it does not retroactively erase copied data.
- Redact API keys, cookies, account IDs where unnecessary, billing details, and cloud credentials from all evidence.
