import { describe, expect, it } from "vitest";
import type { AccessGrant, ExtractedAccessRequest, PolicyDecision } from "../shared/contracts.js";
import { IamSandbox, calculateAccessDiff, lookupTicket } from "../server/tools.js";

const extracted: ExtractedAccessRequest = {
  requesterEmail: "test@acme.example",
  subjectEmail: "test@acme.example",
  resourceId: "developer-sandbox",
  requestedRole: "admin",
  requestedActions: ["read", "write"],
  durationHours: 48,
  justification: "Validate an approved integration in the developer sandbox.",
  ticketId: "DEV-200",
  confidence: 0.99,
  source: "text",
};

const decision: PolicyDecision = {
  outcome: "requires_approval",
  risk: "medium",
  score: 35,
  requestedRole: "admin",
  effectiveRole: "contributor",
  effectiveActions: ["read", "write"],
  maxDurationHours: 24,
  requiresHumanApproval: true,
  findings: [],
  policyVersion: "test",
};

describe("IAM sandbox safety tools", () => {
  it("looks up reference-only ticket evidence and fails closed for an unknown ticket", async () => {
    await expect(lookupTicket("DEV-193")).resolves.toMatchObject({
      ticketId: "DEV-193",
      status: "open",
      referenceOnly: true,
    });
    await expect(lookupTicket("DEV-DOES-NOT-EXIST")).resolves.toBeNull();
  });

  it("calculates a least-privilege, time-bounded diff", () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    const diff = calculateAccessDiff({ request: extracted, decision, currentAccess: [], now });

    expect(diff.before.role).toBeNull();
    expect(diff.after.role).toBe("contributor");
    expect(diff.additions).toEqual(["read", "write"]);
    expect(diff.after.expiresAt).toBe("2026-07-21T00:00:00.000Z");
  });

  it("replays an identical grant idempotently", () => {
    const sandbox = new IamSandbox();
    const input = {
      subjectEmail: extracted.subjectEmail,
      resourceId: extracted.resourceId,
      role: decision.effectiveRole,
      actions: decision.effectiveActions,
      expiresAt: "2026-07-21T00:00:00.000Z",
      idempotencyKey: "wf_test:grant",
      expectedBaseline: [],
    } as const;

    const first = sandbox.grant(input);
    const second = sandbox.grant(input);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.grant.grantId).toBe(first.grant.grantId);
    expect(sandbox.list(extracted.subjectEmail, extracted.resourceId)).toHaveLength(1);
  });

  it("replays a repeated revocation safely", () => {
    const sandbox = new IamSandbox();
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

  it("atomically replaces an operator grant with exact viewer state and restores the baseline", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    const sandbox = new IamSandbox(() => new Date(now));
    const baseline: AccessGrant = {
      grantId: "gr_operator_baseline",
      subjectEmail: extracted.subjectEmail,
      resourceId: extracted.resourceId,
      role: "operator",
      actions: ["read", "list", "logs", "restart"],
      createdAt: now.toISOString(),
      expiresAt: "2030-01-02T00:00:00.000Z",
      status: "active",
      idempotencyKey: "operator-baseline",
    };
    sandbox.restore(baseline);

    const applied = sandbox.grant({
      subjectEmail: extracted.subjectEmail,
      resourceId: extracted.resourceId,
      role: "viewer",
      actions: ["read", "list"],
      expiresAt: "2030-01-01T02:00:00.000Z",
      idempotencyKey: "exact-downgrade",
      expectedBaseline: [baseline],
    });

    const afterApply = sandbox.list(extracted.subjectEmail, extracted.resourceId);
    expect(afterApply.filter((grant) => grant.status === "active")).toEqual([
      expect.objectContaining({
        grantId: applied.grant.grantId,
        role: "viewer",
        actions: ["read", "list"],
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
          actions: ["list", "read"],
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

  it("replaces same role/actions when the reviewed expiry is shorter", () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    const sandbox = new IamSandbox(() => new Date(now));
    const baseline: AccessGrant = {
      grantId: "gr_long_ttl",
      subjectEmail: "ttl@acme.example",
      resourceId: "developer-sandbox",
      role: "viewer",
      actions: ["read", "list"],
      createdAt: now.toISOString(),
      expiresAt: "2030-01-02T00:00:00.000Z",
      status: "active",
      idempotencyKey: "long-ttl",
    };
    sandbox.restore(baseline);

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

  it("expires grants using the injected clock and ignores them in diff and verification", () => {
    let now = new Date("2030-01-01T00:00:00.000Z");
    const sandbox = new IamSandbox(() => new Date(now));
    const expiring: AccessGrant = {
      grantId: "gr_expiring",
      subjectEmail: "clock@acme.example",
      resourceId: "developer-sandbox",
      role: "operator",
      actions: ["read", "list", "logs", "restart"],
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

    const diff = calculateAccessDiff({
      request: { ...extracted, subjectEmail: expiring.subjectEmail, resourceId: expiring.resourceId },
      decision: { ...decision, effectiveRole: "viewer", effectiveActions: ["read", "list"] },
      currentAccess: [{ ...expiring, status: "active" }],
      now,
    });
    expect(diff.before.role).toBeNull();
    expect(diff.removals).toEqual([]);
    expect(diff.additions).toEqual(["read", "list"]);
  });
});
