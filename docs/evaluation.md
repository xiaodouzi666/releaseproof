# ReleaseProof evaluation methodology

ReleaseProof is evaluated at the boundary that matters most: **can untrusted release intent produce a broader, longer, or unauthorized data share?**

The repository contains a deterministic 16-case policy suite. It measures the release-policy boundary independently of model wording. It is not a Qwen extraction-quality benchmark; that requires a labeled corpus of live API calls with human-reviewed expected outputs.

## Candidate identity

- Public repository: [github.com/xiaodouzi666/releaseproof](https://github.com/xiaodouzi666/releaseproof)
- Validated release candidate: [`7a6e503eb03849d19d663597e2993b093c201738`](https://github.com/xiaodouzi666/releaseproof/commit/7a6e503eb03849d19d663597e2993b093c201738)
- Executable evaluation definitions: [candidate-pinned `server/evaluation.ts`](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/evaluation.ts)
- Deterministic policy: [candidate-pinned `server/policy.ts`](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/policy.ts)
- Public deployment: [application](http://8.219.184.228) and [health](http://8.219.184.228/api/health) on Alibaba Cloud Simple Application Server

The repository, immutable candidate, and Alibaba Cloud runtime are verified. Health establishes a configured `live-qwen` client using Qwen Cloud and `qwen3.7-plus`; the separate [public workflow receipt](http://8.219.184.228/api/workflows/wf_5b606ad019564ce9ae) establishes two successful primary-model calls followed by verified release and recall.

## Questions under test

1. Does policy return the expected `requires_approval` or `deny` outcome and risk tier?
2. Are direct identifiers, raw export, and consent override removed from an otherwise valid proposal?
3. Is release TTL capped by dataset sensitivity?
4. Do unknown, inactive, or unverified recipients fail closed?
5. Do unknown/restricted datasets and missing/expired agreements fail closed?
6. Can prompt-like text bypass policy or the data-owner checkpoint?
7. Do execution, read-after-release verification, recall, and hash audit preserve the approved manifest?

## Reproduce the evidence

~~~bash
git checkout 7a6e503eb03849d19d663597e2993b093c201738
pnpm install --frozen-lockfile
pnpm eval
pnpm test
pnpm typecheck
pnpm audit --prod
pnpm build
~~~

Run these commands against the immutable candidate. If this document and executable fixtures disagree, `server/evaluation.ts` and fresh command output are authoritative.

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
| `recipient-resolution-mismatch` | recipient | `deny` | critical | One registry record cannot substitute for another recipient |
| `dataset-unknown` | dataset | `deny` | critical | Request text cannot create an ungoverned dataset |
| `restricted-dataset-deny` | dataset | `deny` | critical | Restricted datasets are never externally released by this prototype |
| `agreement-missing` | agreement | `deny` | critical | A required agreement must resolve before release |
| `agreement-expired` | agreement | `deny` | critical | Expired evidence cannot authorize a release |
| `prompt-injection-contained` | prompt-injection | `requires_approval` | low | Embedded instructions cannot disable policy or the owner gate |
| `duplicate-existing-share` | duplicate-recall | `requires_approval` | low | Existing state is detected so creation remains idempotent and recall-safe |

The expected values mirror the executable fixtures. Change a fixture and this table together, with a policy rationale; never weaken an expectation merely to turn a failing run green.

## Metrics

~~~text
decision agreement = outcome matches / total cases
risk agreement = exact risk-tier matches / total cases
case pass = outcome match AND risk match
case pass rate = passing cases / total cases
safety-case agreement = passing non-routine cases / total non-routine cases
~~~

These are regression metrics, not a formal proof. Stateful safety properties are covered by unit and integration tests.

## Operational guardrails

| Invariant | Candidate-pinned executable evidence |
| --- | --- |
| A denial cannot write | [Workflow policy veto](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/workflow-service.ts) and [integration tests](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/tests/api.integration.test.ts) |
| Approval gates the server-held effective manifest | [Approval and execution re-read](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/workflow-service.ts) |
| Retrying creation produces one share | [Idempotent grant adapter](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/tools.ts) |
| Completion requires exact observed state | [Exact-state verifier](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/tools.ts) and [workflow read-back](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/workflow-service.ts) |
| Recall affects only the workflow share and requires inactive/absent read-back | [Recall orchestration](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/workflow-service.ts) |
| Audit mutation or reordering is detectable | [Audit evidence test](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/tests/api-normalization.test.ts) |
| Provider mode is disclosed | [Provider disclosure](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/qwen.ts) and [health response](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/app.ts) |
| A Qwen key never reaches browser code or API output | [Server-only Qwen construction](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/qwen.ts) and [public request integrity tests](https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/tests/request-integrity.test.ts) |

## Validated ReleaseProof candidate snapshot

The commands were freshly run locally against candidate `7a6e503eb03849d19d663597e2993b093c201738`. Documentation and evidence files being prepared after that commit do not change the executable candidate.

| Field | Value |
| --- | --- |
| Validated commit | [`7a6e503eb03849d19d663597e2993b093c201738`](https://github.com/xiaodouzi666/releaseproof/commit/7a6e503eb03849d19d663597e2993b093c201738) |
| Evaluation timestamp (UTC) | `2026-07-20T18:22:14.100Z` |
| Node / pnpm | `v22.14.0` / `11.7.0` |
| Policy version | `releaseproof-policy-2026.07.1` |
| Deterministic cases | `16/16` (`100.0%`) |
| Test files / tests | `8/8` / `69/69` |
| TypeScript | `pnpm typecheck` passed |
| Production build | `pnpm build` passed |
| Production dependency audit | `pnpm audit --prod` — no known vulnerabilities |

These results establish deterministic policy and software behavior for the candidate. They do not establish CI execution or corpus-wide live-Qwen extraction quality. Alibaba Cloud hosting and a successful live workflow are separately established by [runtime evidence](deployment-proof.md).

## Final production HTTP validation

A fresh production-mode server was started locally from the candidate build with an in-memory audit store and no Qwen key. The complete HTTP lifecycle passed:

- `GET /api/health` and `GET /` returned `200`; health disclosed `recorded-demo` and stated that no live model call was claimed.
- The minimized campaign scenario reached `awaiting_approval`; deterministic policy retained only `aggregate.read` and `profile.read`.
- Owner approval completed the workflow, created one active synthetic share, and passed exact read-after-release verification.
- Manual recall moved the workflow to `rolled_back`, revoked that share, and passed read-after-recall verification.
- The restricted-health scenario ended `denied` with `dataset.restricted_external_release` and no `share.grant` event.
- The production evaluation endpoint returned `16/16`, `passRate=1`, and `safetyInvariantPassRate=1`.

This smoke test exercised the same production Express build and workflow state machine used by the container. It validates application behavior, not live-Qwen inference.

## Model-dependent evaluation

A responsible Qwen evaluation needs a frozen, consented corpus with paraphrases, incomplete requests, typos, multilingual prompts, screenshots, adversarial embedded instructions, and ambiguous recipients/datasets. Human labels could measure:

- exact match for recipient, dataset, purpose, and agreement reference;
- set precision/recall for requested fields;
- TTL error and confidence calibration;
- schema-valid response rate;
- primary/fallback rate, latency, and token usage; and
- policy invariance across equivalent paraphrases.

That corpus evaluation was not run within the submission window. The public workflow receipt is a functional end-to-end proof, not a statistical accuracy result. Deterministic fixture outputs are never mixed into a live-model accuracy number.

## Limitations

- Sixteen cases are focused regression coverage, not statistical assurance.
- Fixture recipients, datasets, and agreements cannot model every enterprise lifecycle or jurisdiction.
- Expected labels are project-authored and still need independent security/privacy review.
- The clean-room adapter creates synthetic share records; it does not move or erase real data.
- Recall blocks future sandbox access but cannot retract copies a recipient already made.
- Passing tests do not make this prototype a production DLP, consent platform, or data-sharing gateway.
