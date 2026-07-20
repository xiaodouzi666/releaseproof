import { describe, expect, it } from "vitest";
import { buildMinimizationReceipt, buildRecallContract } from "../src/minimization";

describe("counterfactual minimization receipt", () => {
  it("shows the requested projection, effective projection, and deterministic removal reasons", () => {
    const receipt = buildMinimizationReceipt({
      requestedRole: "admin",
      effectiveRole: "contributor",
      requestedActions: [
        "aggregate.read",
        "profile.read",
        "email.export",
        "phone.export",
        "raw.export",
        "consent.override",
      ],
      effectiveActions: ["aggregate.read", "profile.read"],
      requestedDurationHours: 72,
      maxDurationHours: 8,
      findings: [
        {
          id: "fields.direct_identifiers_removed",
          title: "Direct identifiers removed",
          detail: "Field minimization removed email.export and phone.export.",
          effect: "warn",
        },
        {
          id: "fields.prohibited_exports_removed",
          title: "Raw and consent-bypass actions removed",
          detail: "ReleaseProof removed raw.export and consent.override.",
          effect: "warn",
        },
      ],
    });

    expect(receipt).toMatchObject({
      requestedRole: "admin",
      effectiveRole: "contributor",
      requestedDurationHours: 72,
      effectiveDurationHours: 8,
      retainedCount: 2,
      removedCount: 4,
    });
    expect(receipt.fields.filter((field) => field.outcome === "retained").map((field) => field.action)).toEqual([
      "aggregate.read",
      "profile.read",
    ]);
    expect(receipt.fields.find((field) => field.action === "email.export")?.reasonId).toBe(
      "fields.direct_identifiers_removed",
    );
    expect(receipt.fields.find((field) => field.action === "phone.export")?.reasonId).toBe(
      "fields.direct_identifiers_removed",
    );
    expect(receipt.fields.find((field) => field.action === "raw.export")?.reasonId).toBe(
      "fields.prohibited_exports_removed",
    );
    expect(receipt.fields.find((field) => field.action === "consent.override")?.reasonId).toBe(
      "fields.prohibited_exports_removed",
    );
  });

  it("deduplicates field names and fails closed when no specific removal finding exists", () => {
    const receipt = buildMinimizationReceipt({
      requestedActions: [" PROFILE.READ ", "profile.read"],
      effectiveActions: [],
      findings: [],
    });

    expect(receipt.fields).toEqual([
      expect.objectContaining({
        action: "profile.read",
        outcome: "removed",
        reasonId: "manifest.fail_closed_omission",
      }),
    ]);
    expect(receipt.effectiveDurationHours).toBeUndefined();
  });
});

describe("pre-approval recall contract", () => {
  it("binds the target, expiry, zero-match success condition, and read-back proof", () => {
    const contract = buildRecallContract({
      recipient: "analyst@northstar.example",
      dataset: "Campaign performance",
      expiresAt: "Jul 21, 08:00",
      activeBaselineShares: 0,
    });

    expect(contract.target).toBe("analyst@northstar.example · Campaign performance");
    expect(contract.trigger).toContain("Jul 21, 08:00");
    expect(contract.baseline).toContain("zero");
    expect(contract.successCondition).toBe("0 active matching shares for this workflow-created release");
    expect(contract.verification).toContain("Read after recall");
  });

  it("discloses that a reviewed active baseline will be restored", () => {
    const contract = buildRecallContract({ activeBaselineShares: 1 });
    expect(contract.baseline).toBe("1 prior active share restored from the reviewed baseline.");
  });
});
