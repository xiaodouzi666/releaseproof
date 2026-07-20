# YouTube upload copy

Paste the **Description** section into the public upload after a final signed-out link and duration check. This working file also retains upload settings and QA notes that should not be pasted into YouTube.

## Title

ReleaseProof — Proof-Carrying Data Release Autopilot | Qwen Cloud Hackathon

## Description

Every dataset release needs a recall path.

ReleaseProof turns an ambiguous request to share enterprise data with an external vendor into a minimized, expiring, data-owner-approved release manifest. It carries recipient, dataset, agreement, policy, approval, observed-share, and recall evidence in one inspectable workflow.

Built for the Global AI Hackathon Series with Qwen Cloud — Track 4: Autopilot Agent.

Live app: http://8.219.184.228

Health: http://8.219.184.228/api/health

Public source: https://github.com/xiaodouzi666/releaseproof

Submitted revision: https://github.com/xiaodouzi666/releaseproof/commit/7a6e503eb03849d19d663597e2993b093c201738

Qwen Cloud integration: https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/server/qwen.ts

Alibaba Cloud deployment proof: https://github.com/xiaodouzi666/releaseproof/blob/main/docs/deployment-proof.md

Architecture: https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/public/architecture.png

License: MIT — https://github.com/xiaodouzi666/releaseproof/blob/7a6e503eb03849d19d663597e2993b093c201738/LICENSE

Qwen performs structured release-intent extraction and read-only evidence planning over recipient, dataset, current-share, and agreement lookups. Deterministic policy minimizes field-actions and TTL or denies the request. A data owner approves the exact effective manifest. A Sandbox clean-room adapter creates the synthetic share idempotently, reads it back, and supports verified recall.

This demo uses synthetic recipients, datasets, agreements, and share state. It does not move real customer data and is not a production DLP, privacy, consent, legal-review, or clean-room service. Recalling a share revokes synthetic access; it does not imply retroactive deletion of copied data.

The Alibaba Cloud runtime is configured as `live-qwen` with Qwen Cloud and `qwen3.7-plus`, but successful inference is not claimed: Alibaba account KYC currently rejects model requests with HTTP 403. The health response proves configuration only. The visible provider badge identifies the mode, and any deterministic recorded-demo fixtures remain explicitly labeled.

Candidate validation: 69/69 automated tests and 16/16 deterministic release-policy cases passed. These results measure software and policy behavior, not live-model quality.

## Upload settings

- Visibility: **Public**
- Audience: **No, it is not made for kids**
- Language: English
- Captions: upload reviewed English captions or correct automatic captions
- License: Standard YouTube License unless another choice is intentionally approved
- Embedding: allowed
- Comments: optional
- Paid-promotion and altered/synthetic-content declarations: answer truthfully for the final edit

## Final signed-out QA

- [ ] Duration is strictly below 3:00.
- [ ] Playback reaches 1080p and works without login.
- [ ] Title and description contain no unresolved placeholders.
- [ ] All links are public and source links are pinned to the submitted revision.
- [ ] No key, cookie, account identifier, billing detail, unrelated tab, or private notification appears.
- [ ] No real vendor, agreement, dataset, employee, or customer data appears.
- [ ] Spoken and visible claims match the live-Qwen/recorded-demo badge.
- [ ] Recall is described accurately as share revocation, not guaranteed downstream erasure.
- [ ] The final public video and description will not change after the deadline.
