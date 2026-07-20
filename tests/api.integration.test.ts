import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import type { AuditEvent, Workflow, WorkflowStatus } from "../shared/contracts.js";
import { createApp } from "../server/app.js";
import { getCurrentAccess, reconcileSandboxEffectiveStates, restoreSandboxGrant } from "../server/tools.js";
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

describe("GrantGuard HTTP workflow integration", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp();
  });

  it("discloses recorded-demo mode without exposing secret-shaped fields", async () => {
    const response = await request(app).get("/api/health").expect(200);

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body.status).toBe("ok");
    expect(response.body.model.mode).toBe("recorded-demo");
    expect(response.body.model.disclosure).toContain("no API key");
    expect(JSON.stringify(response.body)).not.toMatch(/DASHSCOPE_API_KEY|Bearer\s+sk-|sk-[A-Za-z0-9]/);
  });

  it("runs create, mandatory approval, verified grant, and verified rollback idempotently", async () => {
    const first = await request(app)
      .post("/api/workflows")
      .set("Idempotency-Key", "integration-incident-create")
      .send({ scenarioId: "incident-prod-logs" })
      .expect(202);
    const replay = await request(app)
      .post("/api/workflows")
      .set("Idempotency-Key", "integration-incident-create")
      .send({ scenarioId: "incident-prod-logs" })
      .expect(202);

    expect(replay.body.id).toBe(first.body.id);
    const workflowId = String(first.body.id);
    const review = await waitForStatus(app, workflowId, ["awaiting_approval"]);
    expect(review.decision?.outcome).toBe("requires_approval");
    expect(review.decision?.effectiveRole).toBe("operator");
    expect(review.grant).toBeUndefined();
    expect(review.toolPlan).toContain("ticket.lookup");
    expect(review.ticketEvidence).toMatchObject({
      ticketId: "INC-4821",
      referenceOnly: true,
    });
    expect(review.toolTraces.find((trace) => trace.name === "ticket.lookup")).toMatchObject({
      status: "succeeded",
      input: { ticketId: "INC-4821" },
      output: { ticketId: "INC-4821", referenceOnly: true },
    });

    await request(app)
      .post(`/api/workflows/${workflowId}/approve`)
      .set("Idempotency-Key", "integration-incident-approve")
      .send({ approver: "Integration reviewer", note: "Constrained incident response approved." })
      .expect(202);

    const completed = await waitForStatus(app, workflowId, ["completed"]);
    expect(completed.approval?.decision).toBe("approved");
    expect(completed.grant?.status).toBe("active");
    expect(completed.verification?.verified).toBe(true);
    expect(completed.grant?.role).toBe(completed.decision?.effectiveRole);
    expect(completed.grant?.actions).toEqual(completed.decision?.effectiveActions);
    assertValidAuditChain(completed.events);

    const approveReplay = await request(app)
      .post(`/api/workflows/${workflowId}/approve`)
      .set("Idempotency-Key", "integration-incident-approve")
      .send({ approver: "Integration reviewer" })
      .expect(202);
    expect(approveReplay.body.status).toBe("completed");
    expect(approveReplay.body.grant.grantId).toBe(completed.grant?.grantId);

    await request(app)
      .post(`/api/workflows/${workflowId}/rollback`)
      .set("Idempotency-Key", "integration-incident-rollback")
      .send({ approver: "Integration reviewer", note: "End of test window." })
      .expect(202);

    const rolledBack = await waitForStatus(app, workflowId, ["rolled_back"]);
    expect(rolledBack.grant?.status).toBe("revoked");
    expect(rolledBack.rollbackVerification?.verified).toBe(true);
    expect(rolledBack.toolTraces.map((trace) => trace.name)).toEqual(
      expect.arrayContaining(["iam.grant", "iam.verify", "iam.revoke"]),
    );
    assertValidAuditChain(rolledBack.events);
  });

  it("keeps a deterministic denial terminal and impossible to approve", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .send({ scenarioId: "inactive-account" })
      .expect(202);
    const denied = await waitForStatus(app, String(created.body.id), ["denied"]);

    expect(denied.decision?.outcome).toBe("deny");
    expect(denied.decision?.risk).toBe("critical");
    expect(denied.grant).toBeUndefined();
    const response = await request(app)
      .post(`/api/workflows/${denied.id}/approve`)
      .send({ approver: "Unauthorized override" })
      .expect(409);
    expect(response.body.error.code).toBe("WORKFLOW_CONFLICT");
    expect(response.body.error.details.currentStatus).toBe("denied");
  });

  it("denies a dangerous-only scope before approval or any IAM write", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .send({
        requestText:
          "SEC-902: alice@acme.example requests admin on developer-sandbox to delete data and manage IAM for 2 hours during an authorized security exercise.",
      })
      .expect(202);
    const denied = await waitForStatus(app, String(created.body.id), ["denied"]);

    expect(denied.decision?.outcome).toBe("deny");
    expect(denied.decision?.effectiveActions).toEqual([]);
    expect(denied.decision?.findings.map((finding) => finding.id)).toContain(
      "privilege.no_safe_actions_remaining",
    );
    expect(denied.ticketEvidence).toMatchObject({ ticketId: "SEC-902", referenceOnly: true });
    expect(denied.toolTraces.some((trace) => trace.name === "ticket.lookup" && trace.status === "succeeded")).toBe(
      true,
    );
    expect(denied.toolTraces.some((trace) => trace.name.startsWith("iam."))).toBe(false);
  });

  it("supports human rejection without running IAM write tools", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .send({ scenarioId: "developer-staging-deploy" })
      .expect(202);
    const review = await waitForStatus(app, String(created.body.id), ["awaiting_approval"]);
    const rejectedResponse = await request(app)
      .post(`/api/workflows/${review.id}/reject`)
      .send({ approver: "Security reviewer", note: "Change window closed." })
      .expect(200);
    const rejected = rejectedResponse.body as Workflow;

    expect(rejected.status).toBe("rejected");
    expect(rejected.approval?.decision).toBe("rejected");
    expect(rejected.grant).toBeUndefined();
    expect(rejected.toolTraces.some((trace) => trace.name === "iam.grant")).toBe(false);
    assertValidAuditChain(rejected.events);
  });

  it("atomically downgrades operator to viewer and rollback restores the original grant", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .send({ scenarioId: "analyst-readonly" })
      .expect(202);
    const review = await waitForStatus(app, String(created.body.id), ["awaiting_approval"]);
    const baseline = review.currentAccess.find((grant) => grant.status === "active");

    expect(baseline).toMatchObject({
      role: "operator",
      actions: expect.arrayContaining(["read", "list", "logs", "restart"]),
    });
    expect(review.decision?.effectiveRole).toBe("viewer");
    expect(review.diff?.removals).toEqual(expect.arrayContaining(["logs", "restart"]));

    await request(app)
      .post(`/api/workflows/${review.id}/approve`)
      .send({ approver: "Least privilege reviewer", note: "Downgrade to the reviewed exact state." })
      .expect(202);
    const completed = await waitForStatus(app, review.id, ["completed"]);

    expect(completed.grant).toMatchObject({ role: "viewer", actions: ["read", "list"], status: "active" });
    expect(completed.grant?.grantId).not.toBe(baseline?.grantId);
    expect(completed.verification).toMatchObject({
      verified: true,
      activeGrantCount: 1,
      expectedRole: "viewer",
      observedRole: "viewer",
      expectedActions: ["list", "read"],
      observedActions: ["list", "read"],
    });

    await request(app)
      .post(`/api/workflows/${review.id}/rollback`)
      .send({ approver: "Least privilege reviewer", note: "Restore the captured baseline." })
      .expect(202);
    const rolledBack = await waitForStatus(app, review.id, ["rolled_back"]);

    expect(rolledBack.grant?.status).toBe("revoked");
    expect(rolledBack.rollbackVerification).toMatchObject({
      verified: true,
      activeGrantCount: 1,
      expectedRole: "operator",
      observedRole: "operator",
      observedActions: ["list", "logs", "read", "restart"],
    });
    expect(rolledBack.events.some((event) => event.type === "rollback.completed")).toBe(true);
    assertValidAuditChain(rolledBack.events);
  });

  it("does not treat a longer existing expiry as a no-op and enforces the shorter reviewed TTL", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .send({
        requestText:
          "DEV-TTL-7: I am mateo@acme.example. Grant viewer access to storefront-staging for 2 hours to read and list release validation results.",
      })
      .expect(202);
    const review = await waitForStatus(app, String(created.body.id), ["awaiting_approval"]);
    const baseline = review.currentAccess.find((grant) => grant.status === "active");
    expect(baseline).toMatchObject({ role: "viewer", actions: ["read", "list"] });
    expect(new Date(baseline!.expiresAt).getTime()).toBeGreaterThan(new Date(review.diff!.after.expiresAt).getTime());

    await request(app)
      .post(`/api/workflows/${review.id}/approve`)
      .send({ approver: "TTL reviewer", note: "Apply the shorter expiry exactly." })
      .expect(202);
    const completed = await waitForStatus(app, review.id, ["completed"]);

    expect(completed.events.some((event) => event.type === "execution.noop")).toBe(false);
    expect(completed.grant?.grantId).not.toBe(baseline?.grantId);
    expect(completed.grant?.expiresAt).toBe(review.diff?.after.expiresAt);
    expect(completed.verification).toMatchObject({
      verified: true,
      activeGrantCount: 1,
      expectedExpiresAt: review.diff?.after.expiresAt,
      observedExpiresAt: review.diff?.after.expiresAt,
    });

    await request(app)
      .post(`/api/workflows/${review.id}/rollback`)
      .send({ approver: "TTL reviewer", note: "Clean up TTL integration test." })
      .expect(202);
    const rolledBack = await waitForStatus(app, review.id, ["rolled_back"]);
    expect(rolledBack.rollbackVerification).toMatchObject({
      verified: true,
      expectedExpiresAt: baseline?.expiresAt,
      observedExpiresAt: baseline?.expiresAt,
    });
  });

  it("rebuilds one exact effective state across service restarts and preserves rollback baseline", async () => {
    const directory = await mkdtemp(join(tmpdir(), "grantguard-restart-"));
    const previousStore = process.env.AUDIT_STORE;
    const previousFile = process.env.GRANTGUARD_DATA_FILE;
    process.env.AUDIT_STORE = "file";
    process.env.GRANTGUARD_DATA_FILE = join(directory, "store.json");

    try {
      const firstService = await WorkflowService.create();
      const firstApp = await createApp(firstService);
      const created = await request(firstApp)
        .post("/api/workflows")
        .send({ scenarioId: "analyst-readonly" })
        .expect(202);
      const review = await waitForStatus(firstApp, String(created.body.id), ["awaiting_approval"]);
      const baseline = review.currentAccess.find((grant) => grant.status === "active");
      expect(baseline?.role).toBe("operator");
      await request(firstApp)
        .post(`/api/workflows/${review.id}/approve`)
        .send({ approver: "Restart reviewer" })
        .expect(202);
      const completed = await waitForStatus(firstApp, review.id, ["completed"]);
      expect(completed.grant?.role).toBe("viewer");

      // Recreate the exact stale-union condition from the former boot logic.
      restoreSandboxGrant({ ...baseline!, status: "active" });
      expect(await getCurrentAccess("jordan@acme.example", "analytics-prod")).toHaveLength(2);

      const secondService = await WorkflowService.create();
      const secondApp = await createApp(secondService);
      const afterRestart = await getCurrentAccess("jordan@acme.example", "analytics-prod");
      expect(afterRestart).toEqual([
        expect.objectContaining({ grantId: completed.grant?.grantId, role: "viewer", actions: ["read", "list"] }),
      ]);

      await request(secondApp)
        .post(`/api/workflows/${review.id}/rollback`)
        .send({ approver: "Restart reviewer", note: "Restore persisted baseline after restart." })
        .expect(202);
      await waitForStatus(secondApp, review.id, ["rolled_back"]);

      const thirdService = await WorkflowService.create();
      const thirdApp = await createApp(thirdService);
      const persistedRollback = await request(thirdApp).get(`/api/workflows/${review.id}`).expect(200);
      expect(persistedRollback.body).toMatchObject({
        status: "rolled_back",
        rollbackVerification: { verified: true, activeGrantCount: 1, observedRole: "operator" },
      });
      expect(await getCurrentAccess("jordan@acme.example", "analytics-prod")).toEqual([
        expect.objectContaining({ grantId: baseline?.grantId, role: "operator" }),
      ]);
    } finally {
      if (previousStore === undefined) delete process.env.AUDIT_STORE;
      else process.env.AUDIT_STORE = previousStore;
      if (previousFile === undefined) delete process.env.GRANTGUARD_DATA_FILE;
      else process.env.GRANTGUARD_DATA_FILE = previousFile;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects stale rollback without changing the newer workflow grant", async () => {
    const aCreated = await request(app).post("/api/workflows").send({ scenarioId: "analyst-readonly" }).expect(202);
    const aReview = await waitForStatus(app, String(aCreated.body.id), ["awaiting_approval"]);
    await request(app)
      .post(`/api/workflows/${aReview.id}/approve`)
      .send({ approver: "CAS reviewer A" })
      .expect(202);
    const aCompleted = await waitForStatus(app, aReview.id, ["completed"]);

    const bCreated = await request(app)
      .post("/api/workflows")
      .send({
        requestText:
          "OPS-505: I am jordan@acme.example. Grant operator access to analytics-prod for 2 hours to read logs and restart the failed pipeline.",
      })
      .expect(202);
    const bReview = await waitForStatus(app, String(bCreated.body.id), ["awaiting_approval"]);
    await request(app)
      .post(`/api/workflows/${bReview.id}/approve`)
      .send({ approver: "CAS reviewer B" })
      .expect(202);
    const bCompleted = await waitForStatus(app, bReview.id, ["completed"]);

    const stale = await request(app)
      .post(`/api/workflows/${aCompleted.id}/rollback`)
      .send({ approver: "Stale rollback attempt" })
      .expect(409);
    expect(stale.body.error).toMatchObject({ code: "WORKFLOW_CONFLICT" });
    expect(stale.body.error.message).toContain("Stale rollback baseline");
    expect(await getCurrentAccess("jordan@acme.example", "analytics-prod")).toEqual([
      expect.objectContaining({ grantId: bCompleted.grant?.grantId, role: "operator" }),
    ]);
    expect((await request(app).get(`/api/workflows/${aCompleted.id}`).expect(200)).body.status).toBe("completed");

    await request(app)
      .post(`/api/workflows/${bCompleted.id}/rollback`)
      .send({ approver: "CAS cleanup B" })
      .expect(202);
    await waitForStatus(app, bCompleted.id, ["rolled_back"]);
    await request(app)
      .post(`/api/workflows/${aCompleted.id}/rollback`)
      .send({ approver: "CAS cleanup A" })
      .expect(202);
    await waitForStatus(app, aCompleted.id, ["rolled_back"]);
  });

  it("fails a stale approved proposal before IAM mutation", async () => {
    const firstCreated = await request(app).post("/api/workflows").send({ scenarioId: "analyst-readonly" }).expect(202);
    const secondCreated = await request(app).post("/api/workflows").send({ scenarioId: "analyst-readonly" }).expect(202);
    const firstReview = await waitForStatus(app, String(firstCreated.body.id), ["awaiting_approval"]);
    const secondReview = await waitForStatus(app, String(secondCreated.body.id), ["awaiting_approval"]);
    expect(firstReview.currentAccess[0]?.grantId).toBe(secondReview.currentAccess[0]?.grantId);

    await request(app)
      .post(`/api/workflows/${firstReview.id}/approve`)
      .send({ approver: "Concurrency reviewer A" })
      .expect(202);
    const firstCompleted = await waitForStatus(app, firstReview.id, ["completed"]);
    await request(app)
      .post(`/api/workflows/${secondReview.id}/approve`)
      .send({ approver: "Concurrency reviewer B" })
      .expect(202);
    const secondFailed = await waitForStatus(app, secondReview.id, ["failed"]);

    expect(secondFailed.error).toMatchObject({ code: "STALE_APPROVAL_BASELINE", retryable: true });
    expect(secondFailed.events.some((event) => event.type === "execution.stale_baseline")).toBe(true);
    expect(secondFailed.toolTraces.some((trace) => trace.name === "iam.grant")).toBe(false);
    expect(await getCurrentAccess("jordan@acme.example", "analytics-prod")).toEqual([
      expect.objectContaining({ grantId: firstCompleted.grant?.grantId, role: "viewer" }),
    ]);

    await request(app)
      .post(`/api/workflows/${firstCompleted.id}/rollback`)
      .send({ approver: "Concurrency cleanup" })
      .expect(202);
    await waitForStatus(app, firstCompleted.id, ["rolled_back"]);
  });

  it("finalizes an expiry crossed during downtime without scheduling an invalid rollback", async () => {
    const directory = await mkdtemp(join(tmpdir(), "grantguard-expiry-restart-"));
    const storeFile = join(directory, "store.json");
    const previousStore = process.env.AUDIT_STORE;
    const previousFile = process.env.GRANTGUARD_DATA_FILE;
    process.env.AUDIT_STORE = "file";
    process.env.GRANTGUARD_DATA_FILE = storeFile;

    try {
      const baselineExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1_000).toISOString();
      reconcileSandboxEffectiveStates([
        {
          subjectEmail: "jordan@acme.example",
          resourceId: "analytics-prod",
          grant: {
            grantId: "gr_expiry_restart_baseline",
            subjectEmail: "jordan@acme.example",
            resourceId: "analytics-prod",
            role: "operator",
            actions: ["read", "list", "logs", "restart"],
            createdAt: new Date().toISOString(),
            expiresAt: baselineExpiresAt,
            status: "active",
            idempotencyKey: "test:expiry-restart-baseline",
          },
        },
      ]);
      const firstService = await WorkflowService.create();
      const firstApp = await createApp(firstService);
      const created = await request(firstApp).post("/api/workflows").send({ scenarioId: "analyst-readonly" }).expect(202);
      const review = await waitForStatus(firstApp, String(created.body.id), ["awaiting_approval"]);
      await request(firstApp)
        .post(`/api/workflows/${review.id}/approve`)
        .send({ approver: "Expiry restart reviewer" })
        .expect(202);
      const completed = await waitForStatus(firstApp, review.id, ["completed"]);

      const persisted = JSON.parse(await readFile(storeFile, "utf8"));
      persisted.workflows[completed.id].grant.expiresAt = new Date(Date.now() - 60_000).toISOString();
      await writeFile(storeFile, `${JSON.stringify(persisted, null, 2)}\n`, "utf8");

      const restartedService = await WorkflowService.create();
      const restartedApp = await createApp(restartedService);
      const recovered = await request(restartedApp).get(`/api/workflows/${completed.id}`).expect(200);
      expect(recovered.body).toMatchObject({
        status: "rolled_back",
        grant: { status: "revoked" },
        rollbackVerification: { verified: true, activeGrantCount: 1, observedRole: "operator" },
      });
      expect(recovered.body.events.some((event) => event.type === "expiry.recovered_on_restart")).toBe(true);
    } finally {
      if (previousStore === undefined) delete process.env.AUDIT_STORE;
      else process.env.AUDIT_STORE = previousStore;
      if (previousFile === undefined) delete process.env.GRANTGUARD_DATA_FILE;
      else process.env.GRANTGUARD_DATA_FILE = previousFile;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an expired approval before any IAM write", async () => {
    const service = await WorkflowService.create();
    const isolatedApp = await createApp(service);
    const created = await request(isolatedApp)
      .post("/api/workflows")
      .send({ scenarioId: "developer-staging-deploy" })
      .expect(202);
    const review = await waitForStatus(isolatedApp, String(created.body.id), ["awaiting_approval"]);
    await service.store.mutateWorkflow(review.id, (draft) => {
      draft.diff!.after.expiresAt = new Date(Date.now() - 60_000).toISOString();
      draft.proposedExpiresAt = draft.diff!.after.expiresAt;
    });

    const expired = await request(isolatedApp)
      .post(`/api/workflows/${review.id}/approve`)
      .send({ approver: "Late reviewer" })
      .expect(409);
    expect(expired.body.error).toMatchObject({ code: "WORKFLOW_CONFLICT" });
    expect(expired.body.error.message).toContain("proposal has expired");
    const unchanged = await request(isolatedApp).get(`/api/workflows/${review.id}`).expect(200);
    expect(unchanged.body.status).toBe("awaiting_approval");
    expect(unchanged.body.toolTraces.some((trace) => trace.name === "iam.grant")).toBe(false);
  });

  it("returns stable validation, not-found, evaluation, and metrics contracts", async () => {
    const invalid = await request(app).post("/api/workflows").send({ requestText: "short" }).expect(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    expect(invalid.body.error.requestId).toBeTruthy();

    const missing = await request(app).get("/api/not-a-route").expect(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");

    const evaluation = await request(app).get("/api/evaluation").expect(200);
    expect(evaluation.body).toMatchObject({ total: 16, passed: 16, passRate: 1, safetyInvariantPassRate: 1 });

    const metrics = await request(app).get("/api/metrics").expect(200);
    expect(metrics.body.totalWorkflows).toBeGreaterThanOrEqual(3);
    expect(metrics.body.qwen.liveWorkflows).toBe(0);
    expect(metrics.body.qwen.recordedDemoWorkflows).toBeGreaterThanOrEqual(3);
  });
});
