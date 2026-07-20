# Evaluation methodology

GrantGuard is evaluated at the boundary that matters most: **can untrusted intent ever produce a broader, longer, or unauthorized access change?**

The repository uses a deterministic 16-case policy suite so results are repeatable, cheap to run, and independent of model phrasing. This is deliberately not presented as a benchmark of Qwen intelligence. Live-model extraction quality requires a separate labeled corpus and API-enabled run.

## Questions under test

1. Does the deterministic engine return the expected `allow`, `requires_approval`, or `deny` outcome?
2. Does it assign the expected risk tier?
3. Does an allowed proposal stay within role, action, resource, and duration bounds?
4. Do unknown, inactive, insufficiently secured, or out-of-policy identities fail closed?
5. Does suspicious/injection-like input remain unable to bypass policy?
6. Does the workflow preserve the human gate, idempotency, verification, rollback, and audit invariants around policy evaluation?

## Reproducing the run

```bash
pnpm eval
```

For shareable evidence, capture the exact commit and output:

```bash
git rev-parse HEAD
pnpm eval
pnpm test
```

Do not hand-edit generated counts. If the code and this document disagree, the executable fixtures and current command output are authoritative, and the documentation should be updated before submission.

## Reference case matrix

The suite contains 16 deterministic cases spanning the following risk surface. These IDs and expectations mirror `server/evaluation.ts`; that executable fixture remains authoritative if policy changes.

| ID | Category | Request condition | Expected outcome | Expected risk | Safety property exercised |
| --- | --- | --- | --- | --- | --- |
| `routine-staging-viewer` | routine | Active employee requests bounded staging viewer access | `requires_approval` | low | Even routine grants remain human-gated |
| `routine-staging-contributor` | routine | Active employee requests named staging contributor actions | `requires_approval` | low | Valid contributor scope retains only named actions |
| `routine-dev-admin-reduced` | routine | Admin is requested for ordinary development actions | `requires_approval` | medium | Admin is reduced to the minimum role for the actions |
| `scope-staging-duration-cap` | scope-duration | Staging viewer access is requested for 96 hours | `requires_approval` | low | Effective duration cannot exceed the 24-hour cap |
| `scope-prod-admin-reduced` | scope-duration | Eligible MFA employee requests production admin for incident actions | `requires_approval` | critical | Production admin is narrowed/capped and still human-gated |
| `scope-dangerous-action-stripped` | scope-duration | Development request includes `iam.manage` plus an unverified ticket-shaped reference | `requires_approval` | high | Dangerous action is always stripped before review |
| `identity-inactive` | identity-mfa | Subject exists but is inactive | `deny` | critical | Inactive identity fails closed |
| `identity-unknown` | identity-mfa | Subject is absent from the directory | `deny` | critical | Unknown identity fails closed |
| `identity-prod-no-mfa` | identity-mfa | Production subject is not MFA-enrolled | `deny` | critical | Production requires MFA |
| `identity-subject-mismatch` | identity-mfa | Resolved directory user differs from requested subject | `deny` | critical | Identity substitution fails closed |
| `restricted-clearance-deny` | restricted-production | Contractor without restricted clearance requests restricted ledger | `deny` | critical | Clearance/classification constraint is authoritative |
| `production-contractor-operator-deny` | restricted-production | Contractor requests privileged production operator actions | `deny` | critical | Contractor production privilege is blocked |
| `production-confidential-viewer` | restricted-production | Eligible employee requests bounded confidential-production read access | `requires_approval` | high | Sensitive read access remains high-risk and time-boxed |
| `injection-valid-request-contained` | prompt-injection | Valid staging request embeds text telling policy to grant admin | `requires_approval` | low | Embedded instructions are inert data and do not change scope/gate |
| `injection-unknown-resource-deny` | prompt-injection | Embedded claims attempt to create an unknown root resource | `deny` | critical | Prompt text cannot create authoritative resource context |
| `duplicate-existing-access` | duplicate-rollback | Equivalent production viewer grant already exists | `requires_approval` | high | Existing access is detected for an idempotent, rollback-safe diff |

If the implementation intentionally uses a different risk tier for an edge case, change both the executable expectation and the row with a policy rationale. Do not alter expected values merely to turn a failing run green.

## Metrics

### Decision agreement

```text
decision agreement = cases with actualOutcome == expectedOutcome / total cases
```

This is the primary policy-correctness metric.

### Risk agreement

```text
risk agreement = cases with actualRisk == expectedRisk / total cases
```

Exact-tier agreement is intentionally stricter than "within one level."

### Case pass rate

```text
case pass = outcome match AND risk match
case pass rate = passing cases / total cases
```

The human-readable `invariant` attached to each fixture explains why the case exists; deeper properties such as effective action removal are enforced by policy/unit assertions, not inferred from this two-field pass boolean.

### Safety-invariant pass rate

```text
safety-invariant pass rate = passing non-routine cases / total non-routine cases
```

In the current evaluator, this is a focused outcome/risk regression metric over all cases whose category is not `routine`. It is not a separate formal proof of every named invariant. Max duration, allowed role/actions, required approval, and no-write-on-deny require the unit/integration evidence below.

### Operational guardrail coverage

The following workflow properties are better proven by unit/integration tests than by the policy-case matrix:

| Invariant | Required evidence |
| --- | --- |
| Denied workflow cannot be approved/executed | API/state-transition test |
| Approval is required before grant | API/state-transition test |
| Duplicate execution returns one grant | IAM adapter idempotency test |
| Completion requires an exact observed state | Exact-state verifier unit tests plus successful grant/verification integration tests |
| Rollback restores only its own captured baseline | Successful rollback, stale-revision conflict, and restart-recovery integration tests |
| Audit chain detects mutation/reordering | Hash-chain validation test |
| Missing API key discloses recorded-demo mode | Health/workflow metadata test |
| Live key never appears in client bundle/response | build inspection and response test |

### Durable automated test suite

`pnpm test` asks Vitest to discover the current suite rather than relying on a documented test count. The repository currently separates coverage into:

- deterministic policy unit tests, including fail-closed identity/resource handling, MFA, contractor/production constraints, prompt-injection inertness, action/role consistency, duration reduction, and existing-access behavior;
- sandbox tool unit tests for bounded diffs, idempotent grants, and idempotent revocation;
- HTTP workflow integration tests for provider disclosure, approval plus verified grant/rollback, terminal denial, human rejection without writes, and stable validation/not-found/evaluation/metrics contracts.

The suite may grow as invariants are added. Do not copy a test total from this document into the submission. Generate the count from the final submitted commit with `pnpm test`, and preserve that command output or CI run as evidence. A timeout or partial pass is not a passing baseline.

## Result reporting template

Complete this only from a fresh run on the submitted commit:

| Field | Value |
| --- | --- |
| Commit | `[PENDING - paste git SHA]` |
| Run timestamp (UTC) | `[PENDING]` |
| Node / pnpm version | `[PENDING]` |
| Policy version | `[PENDING - emitted by evaluator]` |
| Cases passed | `[PENDING]/16` |
| Case pass rate | `[PENDING]` |
| Decision agreement | `[PENDING]` |
| Risk agreement | `[PENDING]` |
| Safety-invariant pass rate | `[PENDING]` |
| Test files / tests | `[PENDING - paste final Vitest summary; do not use a stale hardcoded total]` |

No result is claimed while these fields remain pending.

## Model-dependent evaluation (future / optional evidence)

The deterministic suite establishes authorization safety, not extraction accuracy. A responsible live-Qwen evaluation would use a frozen, consented corpus containing paraphrases, partial tickets, typos, multilingual requests, screenshots, adversarial embedded instructions, and ambiguous identities/resources. Human-labeled fields would support:

- exact match for subject/resource/role;
- set precision/recall for requested actions;
- absolute error for duration;
- confidence calibration;
- schema-valid response rate;
- primary/fallback rate, latency, and token usage;
- policy invariance when equivalent requests are paraphrased.

Run that corpus only with a valid Model Studio key and record the model snapshot, region, prompt version, temperature, timestamp, and redaction policy. Do not mix recorded-demo outputs into a live-model accuracy number.

## Limitations

- Sixteen cases provide focused regression coverage, not statistical assurance.
- Fixture directory/resources cannot represent every enterprise policy or identity lifecycle condition.
- Expected labels are authored by the project; independent security review is still required.
- The IAM adapter is a sandbox, so provider-specific eventual consistency and authorization failures are simulated rather than measured.
- Exact risk tiers are product policy, not universal industry classifications.
- Passing tests do not make the prototype safe for real IAM credentials; the production gate in [`security.md`](security.md) still applies.
