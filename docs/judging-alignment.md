# Judging and submission alignment

This matrix records the final ReleaseProof review against the live Qwen Cloud hackathon requirements fetched on July 20, 2026. The authoritative sources are the [challenge page](https://qwencloud-hackathon.devpost.com/), [official rules](https://qwencloud-hackathon.devpost.com/rules), [latest final checklist](https://qwencloud-hackathon.devpost.com/updates/45369-this-is-it-your-last-weekend-to-build), and [proof-of-deployment guidance](https://qwencloud-hackathon.devpost.com/updates/45055-proof-of-deployment-101-what-judges-need-to-see).

## Track fit

ReleaseProof targets **Track 4: Autopilot Agent**. It turns an ambiguous external-data request into an end-to-end controlled workflow: typed interpretation, read-only evidence collection, deterministic minimization or denial, a human owner checkpoint, idempotent execution, read-after-release verification, and verified recall. This directly addresses the track's requirements for ambiguous inputs, external tools, a real business workflow, and human-in-the-loop checkpoints.

## Judging criteria

| Criterion | Weight | ReleaseProof evidence |
| --- | ---: | --- |
| Technical Depth & Engineering | 30% | Two-stage Qwen integration, strict Zod schemas, allow-listed read tools, argument rebinding, mandatory evidence completion, an explicit server-side state machine, deterministic policy, idempotent writes, file persistence, read-after-write verification, targeted recall, prior-hash audit events, Docker/Nginx packaging, 69 automated tests, and a 16-case safety evaluation. |
| Innovation & AI Creativity | 30% | The hero contract is **Requested -> Owner-approved effective -> Observed**. A counterfactual minimization receipt explains each retained or removed field-action. A pre-approval Recall Contract binds target, trigger, baseline, success condition, and read-after-recall proof. Qwen has four read tools and zero approval, release, recall, or policy-override tools. |
| Problem Value & Impact | 25% | Enterprise data owners need to release the smallest useful external projection without losing an exit path. ReleaseProof converts that risk into an executable, inspectable release contract and provides a credible path toward vendor, contract, catalog, lineage, consent, and provider-native clean-room integrations. |
| Presentation & Documentation | 15% | A public 2:42 demo, 3:2 thumbnail, current full-page owner review, focused [Recall Contract](../public/screenshots/recall-contract.jpg) and [minimization receipt](../public/screenshots/minimization-receipt.jpg) captures, architecture diagram, public Alibaba Cloud deployment, testing instructions, immutable candidate links, deployment evidence, security notes, and a concise Devpost story expose the key logic without hiding fixture boundaries. |

The live Devpost page currently pairs the first two criterion headings with descriptions that appear swapped. Both are weighted 30%, so ReleaseProof deliberately satisfies both the API/engineering-depth questions and the architecture/innovation questions.

## Final organizer checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| Alibaba Cloud backend screenshot | [`alibaba-cloud-runtime-current.jpg`](assets/deployment/alibaba-cloud-runtime-current.jpg) shows Workbench, executable candidate `7a6e503...`, deployed head `5897546...`, `alibaba-sas`, configured `live-qwen`, healthy file store, and a healthy container. | Submitted to Devpost |
| Public repository | [xiaodouzi666/releaseproof](https://github.com/xiaodouzi666/releaseproof) | Submitted and public |
| Detectable OSI license at repository root | [`LICENSE`](../LICENSE), MIT | Submitted |
| Qwen Cloud API source and base URL | [`server/qwen.ts`](../server/qwen.ts) at candidate `7a6e503eb03849d19d663597e2993b093c201738` | Submitted as a candidate-pinned link |
| Public demo under three minutes | [YouTube, 2:42](https://youtu.be/s64eo9D5PYc) | Submitted and public |
| Architecture diagram | [`public/architecture.png`](../public/architecture.png) | Submitted and uploaded |
| Track selected | Track 4: Autopilot Agent | Submitted |
| Clear what / who / how description | Final Devpost story identifies enterprise data owners, the release-risk problem, the proof path, and the system architecture. | Submitted |
| Qwen Cloud named in description and Built With | Qwen Cloud, Qwen 3.7 Plus, and Qwen 3.6 Flash | Submitted |
| Public working deployment | [http://8.219.184.228](http://8.219.184.228) and [health](http://8.219.184.228/api/health) | Submitted; HTTP only |
| Eligible entrant assertions | Submitter type, residence country, learning level, and sponsor/affiliate/government-employment declaration | Completed by the entrant in the submitted Devpost form |

## Evidence boundary

The Alibaba deployment proves that the submitted container is publicly running with Qwen Cloud configured. At the time of this review, model inference returns HTTP 403 `AccessDenied.Unpurchased` while account KYC/entitlement activation remains pending. ReleaseProof does not represent the configured health response or Recorded Demo fixtures as a successful Qwen call. The code path, base URL, model boundary, schemas, and telemetry are implemented and public; successful live inference requires completion of the account verification gate.

The public video is therefore labeled **Recorded Demo**. It replaces only Qwen extraction and read-plan generation with deterministic fixtures. Policy, owner approval, synthetic share creation, observed-state verification, recall, metrics, and audit use the same application paths.

## Freeze policy

The submission deadline is July 20, 2026 at 21:00 UTC. The organizer's final announcement says not to change the Devpost entry, repository revision, demo video, or linked evidence after the deadline. Keep the public deployment available through the end of judging on August 11, 2026 at 21:00 UTC.
