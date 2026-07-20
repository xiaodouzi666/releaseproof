# ReleaseProof evaluation methodology

ReleaseProof is evaluated at the boundary that matters most: **can untrusted release intent produce a broader, longer, or unauthorized data share?**

The repository contains a deterministic 16-case policy suite. It measures the release-policy boundary independently of model wording. It is not presented as a benchmark of Qwen extraction quality; that requires a separate labeled corpus and an API-enabled run.

## Questions under test

1. Does the policy return the expected `requires_approval` or `deny` outcome and risk tier?
2. Are direct identifiers, raw export, and consent override removed from an otherwise valid proposal?
3. Is the release TTL capped by dataset sensitivity?
4. Do unknown, inactive, or unverified recipients fail closed?
5. Do unknown/restricted datasets and missing/expired agreements fail closed?
6. Can prompt-like text ever bypass policy or the data-owner checkpoint?
7. Do execution, read-after-release verification, recall, and hash audit preserve the approved manifest?

## Reproduce the evidence

~~~bash
git rev-parse HEAD
pnpm eval
pnpm test
pnpm typecheck
pnpm build
~~~

Run these commands against the exact submitted commit. Do not hand-edit generated counts or reuse results from the pre-pivot product. If this document and executable fixtures disagree, `server/evaluation.ts` and current command output are authoritative.

## Deterministic reference matrix

| ID | Category | Expected | Risk | Safety property |
| --- | --- | --- | --- | --- |
| `routine-aggregate-release` | routine | `requires_approval` | low | Aggregate-only releases still require owner approval |
| `routine-profile-release` | routine | `requires_approval` | low | A valid profile release retains only named safe fields |
| `confidential-profile-release` | data-minimization | `requires_approval` | medium | Confidential profile data receives enhanced review and a shorter TTL |
| `contact-fields-stripped` | data-minimization | `requires_approval` | high | Direct contact exports are removed while safe aggregate fields survive |
| `raw-and-consent-actions-stripped` | data-minimization | `requires_approval` | critical | Raw export, identifiers, and consent override are stripped |
| `release-duration-cap` | scope-duration | `requires_approval` | low | A release cannot exceed its deterministic TTL cap |
| `recipient-unknown` | recipient | `deny` | critical | Unknown recipients fail closed |
| `recipient-inactive` | recipient | `deny` | critical | Inactive vendor records cannot receive a release |
| `recipient-unverified` | recipient | `deny` | critical | Unverified suppliers are denied even for aggregate data |
| `recipient-resolution-mismatch` | recipient | `deny` | critical | One registry record cannot be substituted for another recipient |
| `dataset-unknown` | dataset | `deny` | critical | Request text cannot create an ungoverned dataset |
| `restricted-dataset-deny` | dataset | `deny` | critical | Restricted datasets are never externally released by this prototype |
| `agreement-missing` | agreement | `deny` | critical | A required agreement must resolve before release |
| `agreement-expired` | agreement | `deny` | critical | Expired evidence cannot authorize a release |
| `prompt-injection-contained` | prompt-injection | `requires_approval` | low | Embedded instructions cannot disable policy or the owner gate |
| `duplicate-existing-share` | duplicate-recall | `requires_approval` | low | Existing state is detected so creation remains idempotent and recall-safe |

The expected values mirror `server/evaluation.ts`. Change a fixture and this table together, with a policy rationale; never weaken an expectation merely to turn a failing run green.

## Metrics

~~~text
decision agreement = outcome matches / total cases
risk agreement = exact risk-tier matches / total cases
case pass = outcome match AND risk match
case pass rate = passing cases / total cases
safety-case agreement = passing non-routine cases / total non-routine cases
~~~

These are regression metrics, not a formal proof. The fixture invariant explains why each case exists; deeper stateful properties belong in unit and integration tests.

## Operational guardrails

| Invariant | Required executable evidence |
| --- | --- |
| A denial cannot write | API/state-transition test and absence of `share.grant` |
| Approval gates the server-held effective manifest | API state-transition test plus stale-baseline execution test |
| Retrying creation produces one share | Clean-room adapter idempotency test |
| Completion requires exact observed state | `share.verify` unit and workflow integration tests |
| Recall affects only the workflow's share | Recall identity, stale-revision, and recovery tests |
| Recall is reported only after inactive/absent state is observed | `share.recall` plus post-recall verification test |
| Audit mutation or reordering is detectable | Hash-chain validation test |
| Provider mode is honest | Health/workflow metadata tests |
| A Qwen key never reaches browser code or API output | Build inspection and response test |

`pnpm test` discovers the current suite. Do not copy a historical test count into the submission; preserve the final command output or CI run instead.

## Latest local ReleaseProof snapshot

The commands below passed on the current uncommitted working tree. This is useful regression evidence, but it is not yet immutable submission evidence. After the final commit is created, rerun the same commands, replace the commit field, and preserve the output or CI link.

| Field | Value |
| --- | --- |
| Validated commit | `PENDING — working tree not committed` |
| Run timestamp (UTC) | `2026-07-20T11:28:47.019Z` |
| Node / pnpm | `v22.14.0` / `11.7.0` |
| Policy version | `releaseproof-policy-2026.07.1` |
| Deterministic cases | `16/16` (`100.0%`) |
| Test files / tests | `7/7` / `62/62` |
| TypeScript | `pnpm typecheck` passed |
| Production build | `pnpm build` passed |
| Production dependency audit | `pnpm audit --prod` — no known vulnerabilities |

Replace the remaining `PENDING` only after rerunning from the exact final commit. These results establish deterministic policy and software behavior; they do not establish live-Qwen extraction quality or a successful Alibaba Cloud invocation.

## Model-dependent evaluation

A responsible live-Qwen evaluation needs a frozen, consented corpus with paraphrases, incomplete requests, typos, multilingual prompts, screenshots, adversarial embedded instructions, and ambiguous recipients/datasets. Human labels can measure:

- exact match for recipient, dataset, purpose, and agreement reference;
- set precision/recall for requested fields;
- TTL error and confidence calibration;
- schema-valid response rate;
- primary/fallback rate, latency, and token usage;
- policy invariance across equivalent paraphrases.

Record the model snapshot, region, prompt version, temperature, timestamp, and redaction policy. Never mix deterministic fixture outputs into a live-model accuracy number.

## Limitations

- Sixteen cases are focused regression coverage, not statistical assurance.
- Fixture recipients, datasets, and agreements cannot model every enterprise lifecycle or jurisdiction.
- Expected labels are project-authored and still need independent security/privacy review.
- The clean-room adapter creates synthetic share records; it does not move or erase real data.
- Recall blocks future sandbox access but cannot retract copies a recipient already made.
- Passing tests do not make this prototype a production DLP, consent platform, or data-sharing gateway.
