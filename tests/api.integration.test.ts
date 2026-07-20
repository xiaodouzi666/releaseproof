import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import type { AuditEvent, Workflow, WorkflowStatus } from "../shared/contracts.js";
import { createApp } from "../server/app.js";
import { getCurrentShares } from "../server/tools.js";
import { WorkflowService } from "../server/workflow-service.js";

process.env.AUDIT_STORE = "memory";
process.env.DEMO_STEP_DELAY_MS = "0";
delete process.env.DASHSCOPE_API_KEY;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function assertValidAuditChain(events: AuditEvent[]): void {
  expect(events.length).toBeGreaterThan(0);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    expect(event.sequence).toBe(index + 1);
    expect(event.previousHash).toBe(index === 0 ? null : events[index - 1]!.hash);
    const { hash, ...eventWithoutHash } = event;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(createHash("sha256").update(canonicalJson(eventWithoutHash)).digest("hex")).toBe(hash);
  }
}

async function waitForStatus(
  app: Awaited<ReturnType<typeof createApp>>,
  id: string,
  accepted: WorkflowStatus[],
  timeoutMs = 5_000,
): Promise<Workflow> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request(app).get(`/api/workflows/${id}`).expect(200);
    const workflow = response.body as Workflow;
    if (accepted.includes(workflow.status)) return workflow;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const last = await request(app).get(`/api/workflows/${id}`).expect(200);
  throw new Error(`Workflow ${id} did not reach ${accepted.join(" or ")}; last status=${last.body.status}`);
}

describe("ReleaseProof HTTP workflow integration", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp();
  });

  it("discloses recorded-demo mode and ReleaseProof service identity without secrets", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({ status: "ok", service: "releaseproof-api" });
    expect(response.body.model.mode).toBe("recorded-demo");
    expect(response.body.model.disclosure).toContain("no API key");
    expect(JSON.stringify(response.body)).not.toMatch(/DASHSCOPE_API_KEY|Bearer\s+sk-|sk-[A-Za-z0-9]/);
  });

  it("publishes five reproducible data-release scenarios", async () => {
    const response = await request(app).get("/api/scenarios").expect(200);
    expect(response.body.map((scenario: { id: string }) => scenario.id)).toEqual([
      "campaign-vendor-minimized",
      "restricted-health-denied",
      "existing-aggregate-share",
      "inactive-recipient",
      "unverified-vendor",
    ]);
  });

  it("runs minimized release, approval, verification, and recall idempotently", async () => {
    const first = await request(app)
      .post("/api/workflows")
      .set("Idempotency-Key", "campaign-release-create")
      .send({ scenarioId: "campaign-vendor-minimized" })
      .expect(202);
    const replay = await request(app)
      .post("/api/workflows")
      .set("Idempotency-Key", "campaign-release-create")
      .send({ scenarioId: "campaign-vendor-minimized" })
      .expect(202);
    expect(replay.body.id).toBe(first.body.id);

    const review = await waitForStatus(app, String(first.body.id), ["awaiting_approval"]);
    expect(review.decision).toMatchObject({
      outcome: "requires_approval",
      effectiveRole: "contributor",
      effectiveActions: ["aggregate.read", "profile.read"],
    });
    expect(review.toolPlan).toContain("agreement.lookup");
    expect(review.ticketEvidence).toMatchObject({ ticketId: "DPA-203", status: "active", referenceOnly: true });
    expect(review.toolTraces.map((trace) => trace.name)).toEqual(
      expect.arrayContaining(["recipient.lookup", "dataset.lookup", "share.current", "agreement.lookup", "policy.evaluate", "release.diff"]),
    );

    await request(app)
      .post(`/api/workflows/${review.id}/approve`)
      .set("Idempotency-Key", "campaign-release-approve")
      .send({ approver: "Privacy reviewer", note: "Minimized fields and eight-hour expiry approved." })
      .expect(202);
    const completed = await waitForStatus(app, review.id, ["completed"]);
    expect(completed.grant).toMatchObject({ status: "active", role: "contributor" });
    expect(completed.verification?.verified).toBe(true);
    expect(completed.toolTraces.map((trace) => trace.name)).toEqual(
      expect.arrayContaining(["share.grant", "share.verify"]),
    );
    assertValidAuditChain(completed.events);

    const approvalReplay = await request(app)
      .post(`/api/workflows/${review.id}/approve`)
      .set("Idempotency-Key", "campaign-release-approve")
      .send({ approver: "Privacy reviewer" })
      .expect(202);
    expect(approvalReplay.body.grant.grantId).toBe(completed.grant?.grantId);

    await request(app)
      .post(`/api/workflows/${review.id}/recall`)
      .send({ approver: "Privacy reviewer", note: "Recall after vendor task." })
      .expect(202);
    const recalled = await waitForStatus(app, review.id, ["rolled_back"]);
    expect(recalled.grant?.status).toBe("revoked");
    expect(recalled.rollbackVerification?.verified).toBe(true);
    expect(recalled.toolTraces.map((trace) => trace.name)).toEqual(expect.arrayContaining(["share.recall", "share.verify"]));
    expect(recalled.events.some((event) => event.type === "recall.completed")).toBe(true);
  });

  it("keeps an inactive-recipient denial terminal and impossible to approve", async () => {
    const created = await request(app).post("/api/workflows").send({ scenarioId: "inactive-recipient" }).expect(202);
    const denied = await waitForStatus(app, String(created.body.id), ["denied"]);
    expect(denied.decision?.findings.map((finding) => finding.id)).toContain("recipient.inactive_or_unknown");
    const response = await request(app)
      .post(`/api/workflows/${denied.id}/approve`)
      .send({ approver: "Unauthorized override" })
      .expect(409);
    expect(response.body.error).toMatchObject({ code: "WORKFLOW_CONFLICT", details: { currentStatus: "denied" } });
  });

  it("hard-denies a restricted dataset despite verified recipient and agreement", async () => {
    const created = await request(app).post("/api/workflows").send({ scenarioId: "restricted-health-denied" }).expect(202);
    const denied = await waitForStatus(app, String(created.body.id), ["denied"]);
    expect(denied.decision?.findings.map((finding) => finding.id)).toContain("dataset.restricted_external_release");
    expect(denied.toolTraces.some((trace) => trace.name === "share.grant")).toBe(false);
  });

  it("denies a dangerous-only custom release before approval or sharing", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .send({
        requestText:
          "DPA-203: I am privacy@acme.example. Share campaign-performance with analyst@northstar.example at admin tier for 2 hours using raw.export and consent.override for campaign measurement.",
      })
      .expect(202);
    const denied = await waitForStatus(app, String(created.body.id), ["denied"]);
    expect(denied.decision?.effectiveActions).toEqual([]);
    expect(denied.decision?.findings.map((finding) => finding.id)).toContain("fields.no_safe_scope_remaining");
    expect(denied.toolTraces.some((trace) => trace.name.startsWith("share.") && trace.name !== "share.current")).toBe(false);
  });

  it("supports human rejection without creating an external share", async () => {
    const created = await request(app).post("/api/workflows").send({ scenarioId: "existing-aggregate-share" }).expect(202);
    const review = await waitForStatus(app, String(created.body.id), ["awaiting_approval"]);
    const rejected = await request(app)
      .post(`/api/workflows/${review.id}/reject`)
      .send({ approver: "Privacy reviewer", note: "Purpose window closed." })
      .expect(200);
    expect(rejected.body).toMatchObject({ status: "rejected", approval: { decision: "rejected" } });
    expect(rejected.body.toolTraces.some((trace: { name: string }) => trace.name === "share.grant")).toBe(false);
  });

  it("verifies an equivalent existing share instead of issuing a duplicate", async () => {
    const created = await request(app).post("/api/workflows").send({ scenarioId: "existing-aggregate-share" }).expect(202);
    const review = await waitForStatus(app, String(created.body.id), ["awaiting_approval"]);
    expect(review.decision?.findings.map((finding) => finding.id)).toContain("share.duplicate_avoided");
    expect(review.diff?.additions).toEqual([]);

    await request(app)
      .post(`/api/workflows/${review.id}/approve`)
      .send({ approver: "Data owner", note: "Verify existing aggregate envelope." })
      .expect(202);
    const completed = await waitForStatus(app, review.id, ["completed"]);
    expect(completed.events.some((event) => event.type === "execution.noop")).toBe(true);
    expect(completed.verification?.verified).toBe(true);
    expect(completed.toolTraces.some((trace) => trace.name === "share.grant")).toBe(false);
  });

  it("fails a stale approved release before share creation", async () => {
    const firstCreated = await request(app).post("/api/workflows").send({ scenarioId: "campaign-vendor-minimized" }).expect(202);
    const secondCreated = await request(app).post("/api/workflows").send({ scenarioId: "campaign-vendor-minimized" }).expect(202);
    const firstReview = await waitForStatus(app, String(firstCreated.body.id), ["awaiting_approval"]);
    const secondReview = await waitForStatus(app, String(secondCreated.body.id), ["awaiting_approval"]);

    await request(app).post(`/api/workflows/${firstReview.id}/approve`).send({ approver: "Reviewer A" }).expect(202);
    const firstCompleted = await waitForStatus(app, firstReview.id, ["completed"]);
    await request(app).post(`/api/workflows/${secondReview.id}/approve`).send({ approver: "Reviewer B" }).expect(202);
    const secondFailed = await waitForStatus(app, secondReview.id, ["failed"]);
    expect(secondFailed.error).toMatchObject({ code: "STALE_APPROVAL_BASELINE", retryable: true });
    expect(secondFailed.toolTraces.some((trace) => trace.name === "share.grant")).toBe(false);

    await request(app).post(`/api/workflows/${firstCompleted.id}/recall`).send({ approver: "Cleanup" }).expect(202);
    await waitForStatus(app, firstCompleted.id, ["rolled_back"]);
  });

  it("reconciles the exact active share across a file-store restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "releaseproof-restart-"));
    const previousStore = process.env.AUDIT_STORE;
    const previousFile = process.env.RELEASEPROOF_DATA_FILE;
    process.env.AUDIT_STORE = "file";
    process.env.RELEASEPROOF_DATA_FILE = join(directory, "store.json");
    try {
      const firstService = await WorkflowService.create();
      const firstApp = await createApp(firstService);
      const created = await request(firstApp).post("/api/workflows").send({ scenarioId: "campaign-vendor-minimized" }).expect(202);
      const review = await waitForStatus(firstApp, String(created.body.id), ["awaiting_approval"]);
      await request(firstApp).post(`/api/workflows/${review.id}/approve`).send({ approver: "Restart reviewer" }).expect(202);
      const completed = await waitForStatus(firstApp, review.id, ["completed"]);

      const secondService = await WorkflowService.create();
      const secondApp = await createApp(secondService);
      expect(await getCurrentShares("analyst@northstar.example", "campaign-performance")).toEqual([
        expect.objectContaining({ grantId: completed.grant?.grantId, actions: ["aggregate.read", "profile.read"] }),
      ]);
      await request(secondApp).post(`/api/workflows/${review.id}/recall`).send({ approver: "Restart reviewer" }).expect(202);
      await waitForStatus(secondApp, review.id, ["rolled_back"]);
    } finally {
      if (previousStore === undefined) delete process.env.AUDIT_STORE;
      else process.env.AUDIT_STORE = previousStore;
      if (previousFile === undefined) delete process.env.RELEASEPROOF_DATA_FILE;
      else process.env.RELEASEPROOF_DATA_FILE = previousFile;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an expired approval before any share write", async () => {
    const service = await WorkflowService.create();
    const isolatedApp = await createApp(service);
    const created = await request(isolatedApp).post("/api/workflows").send({ scenarioId: "campaign-vendor-minimized" }).expect(202);
    const review = await waitForStatus(isolatedApp, String(created.body.id), ["awaiting_approval"]);
    await service.store.mutateWorkflow(review.id, (draft) => {
      draft.diff!.after.expiresAt = new Date(Date.now() - 60_000).toISOString();
      draft.proposedExpiresAt = draft.diff!.after.expiresAt;
    });
    const expired = await request(isolatedApp)
      .post(`/api/workflows/${review.id}/approve`)
      .send({ approver: "Late reviewer" })
      .expect(409);
    expect(expired.body.error.message).toContain("proposal has expired");
    const unchanged = await request(isolatedApp).get(`/api/workflows/${review.id}`).expect(200);
    expect(unchanged.body.toolTraces.some((trace: { name: string }) => trace.name === "share.grant")).toBe(false);
  });

  it("returns a passing 16-case release-policy evaluation and operational metrics", async () => {
    const evaluation = await request(app).get("/api/evaluation").expect(200);
    expect(evaluation.body).toMatchObject({ total: 16, passed: 16, passRate: 1, safetyInvariantPassRate: 1 });
    expect(evaluation.body.policyVersion).toBe("releaseproof-policy-2026.07.1");
    const metrics = await request(app).get("/api/metrics").expect(200);
    expect(metrics.body.totalWorkflows).toBeGreaterThanOrEqual(8);
    expect(metrics.body.qwen.liveWorkflows).toBe(0);
    expect(metrics.body.qwen.recordedDemoWorkflows).toBeGreaterThanOrEqual(8);
  });

  it("keeps validation, non-cacheable workflow reads, and not-found contracts stable", async () => {
    const invalid = await request(app).post("/api/workflows").send({ requestText: "short" }).expect(400);
    expect(invalid.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
    const unknownScenario = await request(app).post("/api/workflows").send({ scenarioId: "missing" }).expect(400);
    expect(unknownScenario.body.error.code).toBe("SCENARIO_NOT_FOUND");
    const missing = await request(app).get("/api/not-a-route").expect(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    const created = await request(app).post("/api/workflows").send({ scenarioId: "unverified-vendor" }).expect(202);
    const fetched = await request(app).get(`/api/workflows/${created.body.id}`).expect(200);
    expect(fetched.headers["cache-control"]).toBe("no-store");
  });
});
