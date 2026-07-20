import { describe, expect, it } from "vitest";
import type { AccessGrant, ExtractedAccessRequest, PolicyDecision } from "../shared/contracts.js";
import { ShareSandbox, calculateReleaseDiff, lookupAgreement } from "../server/tools.js";

const extracted: ExtractedAccessRequest = {
  requesterEmail: "test@acme.example",
  subjectEmail: "analyst@northstar.example",
  resourceId: "campaign-performance",
  requestedRole: "admin",
  requestedActions: ["aggregate.read", "profile.read"],
  durationHours: 48,
  justification: "Measure campaign lift with minimized profile fields.",
  ticketId: "DPA-203",
  confidence: 0.99,
  source: "text",
};

const decision: PolicyDecision = {
  outcome: "requires_approval",
  risk: "medium",
  score: 35,
  requestedRole: "admin",
  effectiveRole: "contributor",
  effectiveActions: ["aggregate.read", "profile.read"],
  maxDurationHours: 24,
  requiresHumanApproval: true,
  findings: [],
  policyVersion: "test",
};

describe("release sandbox safety tools", () => {
  it("looks up reference-only agreement evidence and fails closed for an unknown agreement", async () => {
    await expect(lookupAgreement("DPA-203")).resolves.toMatchObject({
      ticketId: "DPA-203",
      status: "active",
      referenceOnly: true,
    });
    await expect(lookupAgreement("DPA-DOES-NOT-EXIST")).resolves.toBeNull();
  });

  it("calculates a least-privilege, time-bounded diff", () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    const diff = calculateReleaseDiff({ request: extracted, decision, currentAccess: [], now });

    expect(diff.before.role).toBeNull();
    expect(diff.after.role).toBe("contributor");
    expect(diff.additions).toEqual(["aggregate.read", "profile.read"]);
    expect(diff.after.expiresAt).toBe("2026-07-21T00:00:00.000Z");
  });

  it("replays an identical share idempotently", () => {
    const sandbox = new ShareSandbox();
    const input = {
      subjectEmail: extracted.subjectEmail,
      resourceId: extracted.resourceId,
      role: decision.effectiveRole,
      actions: decision.effectiveActions,
      expiresAt: "2026-07-21T00:00:00.000Z",
      idempotencyKey: "wf_test:share",
      expectedBaseline: [],
    } as const;

    const first = sandbox.grant(input);
    const second = sandbox.grant(input);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.grant.grantId).toBe(first.grant.grantId);
    expect(sandbox.list(extracted.subjectEmail, extracted.resourceId)).toHaveLength(1);
  });

  it("replays a repeated recall safely", () => {
    const sandbox = new ShareSandbox();
    const created = sandbox.grant({
      subjectEmail: extracted.subjectEmail,
      resourceId: extracted.resourceId,
      role: decision.effectiveRole,
      actions: decision.effectiveActions,
      expiresAt: "2026-07-21T00:00:00.000Z",
      idempotencyKey: "wf_test:revoke",
      expectedBaseline: [],
    });

    const first = sandbox.revoke(created.grant.grantId);
    const second = sandbox.revoke(created.grant.grantId);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.grant.status).toBe("revoked");
  });

  it("atomically replaces a contact-tier share with exact aggregate state and restores the baseline", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    const sandbox = new ShareSandbox(() => new Date(now));
    const baseline: AccessGrant = {
      grantId: "gr_operator_baseline",
      subjectEmail: extracted.subjectEmail,
      resourceId: extracted.resourceId,
      role: "operator",
      actions: ["aggregate.read", "profile.read", "email.export", "phone.export"],
      createdAt: now.toISOString(),
      expiresAt: "2030-01-02T00:00:00.000Z",
      status: "active",
      idempotencyKey: "operator-baseline",
    };
    sandbox.restore(baseline);

    const reviewed = calculateReleaseDiff({
      request: {
        ...extracted,
        subjectEmail: baseline.subjectEmail,
        resourceId: baseline.resourceId,
        requestedRole: "viewer",
        requestedActions: ["aggregate.read"],
        durationHours: 2,
      },
      decision: { ...decision, effectiveRole: "viewer", effectiveActions: ["aggregate.read"], maxDurationHours: 24 },
      currentAccess: [baseline],
      now,
    });
    expect(reviewed.after.expiresAt).toBe("2030-01-01T02:00:00.000Z");

    const applied = sandbox.grant({
      subjectEmail: extracted.subjectEmail,
      resourceId: extracted.resourceId,
      role: "viewer",
      actions: ["aggregate.read"],
      expiresAt: "2030-01-01T02:00:00.000Z",
      idempotencyKey: "exact-downgrade",
      expectedBaseline: [baseline],
    });

    const afterApply = sandbox.list(extracted.subjectEmail, extracted.resourceId);
    expect(afterApply.filter((grant) => grant.status === "active")).toEqual([
      expect.objectContaining({
        grantId: applied.grant.grantId,
        role: "viewer",
        actions: ["aggregate.read"],
        expiresAt: "2030-01-01T02:00:00.000Z",
      }),
    ]);
    expect(afterApply.find((grant) => grant.grantId === baseline.grantId)?.status).toBe("revoked");
    expect(applied.replacedGrants).toEqual([baseline]);
    expect(
      sandbox.verify({
        subjectEmail: extracted.subjectEmail,
        resourceId: extracted.resourceId,
        expected: {
          grantId: applied.grant.grantId,
          role: "viewer",
          actions: ["aggregate.read"],
          expiresAt: "2030-01-01T02:00:00.000Z",
        },
      }),
    ).toMatchObject({ verified: true, activeGrantCount: 1 });

    const rollback = sandbox.restoreBaseline({
      grantId: applied.grant.grantId,
      baseline: applied.replacedGrants,
      idempotencyKey: "exact-downgrade-rollback",
    });
    expect(rollback.revokedGrant.status).toBe("revoked");
    expect(rollback.restoredGrants).toEqual([baseline]);
    expect(
      sandbox.verify({
        subjectEmail: extracted.subjectEmail,
        resourceId: extracted.resourceId,
        expected: {
          grantId: baseline.grantId,
          role: baseline.role,
          actions: baseline.actions,
          expiresAt: baseline.expiresAt,
        },
      }).verified,
    ).toBe(true);
  });

  it("replaces the same release envelope when the reviewed expiry is shorter", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    const sandbox = new ShareSandbox(() => new Date(now));
    const baseline: AccessGrant = {
      grantId: "gr_long_ttl",
      subjectEmail: "ttl@acme.example",
      resourceId: "product-telemetry",
      role: "viewer",
      actions: ["aggregate.read"],
      createdAt: now.toISOString(),
      expiresAt: "2030-01-02T00:00:00.000Z",
      status: "active",
      idempotencyKey: "long-ttl",
    };
    sandbox.restore(baseline);

    const reviewed = calculateReleaseDiff({
      request: {
        ...extracted,
        subjectEmail: baseline.subjectEmail,
        resourceId: baseline.resourceId,
        requestedRole: "viewer",
        requestedActions: ["aggregate.read"],
        durationHours: 2,
      },
      decision: { ...decision, effectiveRole: "viewer", effectiveActions: ["aggregate.read"], maxDurationHours: 24 },
      currentAccess: [baseline],
      now,
    });
    expect(reviewed.after.expiresAt).toBe("2030-01-01T02:00:00.000Z");

    const applied = sandbox.grant({
      subjectEmail: baseline.subjectEmail,
      resourceId: baseline.resourceId,
      role: baseline.role,
      actions: baseline.actions,
      expiresAt: "2030-01-01T02:00:00.000Z",
      idempotencyKey: "short-ttl",
      expectedBaseline: [baseline],
    });
    const active = sandbox.list(baseline.subjectEmail, baseline.resourceId).filter((grant) => grant.status === "active");

    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ grantId: applied.grant.grantId, expiresAt: "2030-01-01T02:00:00.000Z" });
    expect(active[0]?.grantId).not.toBe(baseline.grantId);
    expect(applied.replacedGrants.map((grant) => grant.grantId)).toEqual([baseline.grantId]);
  });

  it("expires shares using the injected clock and ignores them in diff and verification", () => {
    let now = new Date("2030-01-01T00:00:00.000Z");
    const sandbox = new ShareSandbox(() => new Date(now));
    const expiring: AccessGrant = {
      grantId: "gr_expiring",
      subjectEmail: "clock@acme.example",
      resourceId: "product-telemetry",
      role: "operator",
      actions: ["aggregate.read", "profile.read", "email.export", "phone.export"],
      createdAt: now.toISOString(),
      expiresAt: "2030-01-01T01:00:00.000Z",
      status: "active",
      idempotencyKey: "clock-expiring",
    };
    sandbox.restore(expiring);
    expect(sandbox.current(expiring.subjectEmail, expiring.resourceId)).toHaveLength(1);

    now = new Date("2030-01-01T02:00:00.000Z");
    const afterExpiry = sandbox.list(expiring.subjectEmail, expiring.resourceId);
    expect(afterExpiry.find((grant) => grant.grantId === expiring.grantId)?.status).toBe("revoked");
    expect(sandbox.current(expiring.subjectEmail, expiring.resourceId)).toEqual([]);
    expect(
      sandbox.verify({ subjectEmail: expiring.subjectEmail, resourceId: expiring.resourceId, expected: null }),
    ).toMatchObject({ verified: true, activeGrantCount: 0 });

    const diff = calculateReleaseDiff({
      request: { ...extracted, subjectEmail: expiring.subjectEmail, resourceId: expiring.resourceId },
      decision: { ...decision, effectiveRole: "viewer", effectiveActions: ["aggregate.read"] },
      currentAccess: [{ ...expiring, status: "active" }],
      now,
    });
    expect(diff.before.role).toBeNull();
    expect(diff.removals).toEqual([]);
    expect(diff.additions).toEqual(["aggregate.read"]);
  });
});
