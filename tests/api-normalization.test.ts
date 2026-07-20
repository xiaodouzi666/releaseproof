import { describe, expect, it } from "vitest";
import { normalizeEvaluation, normalizeMetrics, normalizeWorkflow } from "../src/api";

describe("frontend workflow normalization", () => {
  it.each([
    [60, "high"],
    [30, "medium"],
    [10, "low"],
  ] as const)("uses the backend risk contract for score %s", (riskScore, risk) => {
    const workflow = normalizeWorkflow({
      id: "wf-risk",
      status: "awaiting_approval",
      decision: { riskScore, risk, findings: [] },
    });

    expect(workflow.risk).toMatchObject({ score: riskScore, level: risk });
  });

  it("preserves deterministic policy finding details as operator evidence", () => {
    const workflow = normalizeWorkflow({
      id: "wf-policy-detail",
      status: "denied",
      decision: {
        riskScore: 100,
        risk: "critical",
        findings: [
          {
            id: "recipient.inactive_or_unknown",
            title: "Inactive recipient",
            detail: "The vendor registry marks this recipient inactive; no share can be proposed.",
            effect: "deny",
          },
        ],
      },
    });

    expect(workflow.status).toBe("denied");
    expect(workflow.policyEvidence).toEqual([
      expect.objectContaining({
        id: "recipient.inactive_or_unknown",
        policy: "Inactive recipient",
        verdict: "block",
        explanation: "The vendor registry marks this recipient inactive; no share can be proposed.",
      }),
    ]);
  });

  it("retains adjacent audit hashes for expandable UI evidence", () => {
    const workflow = normalizeWorkflow({
      id: "wf-audit",
      status: "completed",
      events: [
        {
          id: "evt-2",
          sequence: 2,
          type: "policy.completed",
          message: "Policy completed.",
          previousHash: "a".repeat(64),
          hash: "b".repeat(64),
          data: { risk: "low" },
        },
      ],
    });

    expect(workflow.timeline[0]?.details).toMatchObject({
      sequence: 2,
      previousHash: "a".repeat(64),
      hash: "b".repeat(64),
      risk: "low",
    });
  });

  it("prioritizes operational metrics that show agent quality and live-model evidence", () => {
    const metrics = normalizeMetrics({
      generatedAt: "2026-07-20T08:00:00.000Z",
      totalWorkflows: 7,
      completionRate: 0.71,
      approvalRate: 0.5,
      rollbackRate: 0.2,
      denialRate: 0.3,
      averageTimeToDecisionMs: 420,
      averageToolLatencyMs: 18,
      toolSuccessRate: 1,
      qwen: { calls: 4, latencyMs: 1_230 },
    });

    expect(metrics.slice(0, 6).map((metric) => metric.key)).toEqual([
      "totalWorkflows",
      "completionRate",
      "toolSuccessRate",
      "averageTimeToDecisionMs",
      "qwenCalls",
      "qwenLatency",
    ]);
    expect(metrics.find((metric) => metric.key === "averageTimeToDecisionMs")?.value).toBe("420 ms");
    expect(metrics.find((metric) => metric.key === "completionRate")?.value).toBe("71%");
    expect(metrics.find((metric) => metric.key === "toolSuccessRate")?.value).toBe("100%");
    expect(metrics.some((metric) => metric.key === "generatedAt")).toBe(false);
  });

  it("does not mistake counts or one-millisecond latency for percentages", () => {
    const metrics = normalizeMetrics({
      totalWorkflows: 1,
      completionRate: 1,
      averageTimeToDecisionMs: 1,
      qwen: { calls: 1, latencyMs: 1 },
    });

    expect(metrics.find((metric) => metric.key === "totalWorkflows")?.value).toBe("1");
    expect(metrics.find((metric) => metric.key === "completionRate")?.value).toBe("100%");
    expect(metrics.find((metric) => metric.key === "averageTimeToDecisionMs")?.value).toBe("1 ms");
    expect(metrics.find((metric) => metric.key === "qwenCalls")?.value).toBe("1");
    expect(metrics.find((metric) => metric.key === "qwenLatency")?.value).toBe("1 ms");
  });

  it("surfaces structured workflow failures for operator recovery", () => {
    const workflow = normalizeWorkflow({
      id: "wf-failed",
      status: "failed",
      error: {
        code: "STALE_APPROVAL_BASELINE",
        message: "Observed share state changed after approval.",
        retryable: true,
      },
    });

    expect(workflow.error).toEqual({
      code: "STALE_APPROVAL_BASELINE",
      message: "Observed share state changed after approval.",
      retryable: true,
    });
  });

  it("maps the evaluation total and generation timestamp", () => {
    const evaluation = normalizeEvaluation({
      generatedAt: "2026-07-20T08:00:00.000Z",
      policyVersion: "releaseproof-policy-2026.07.1",
      total: 16,
      passed: 16,
      passRate: 1,
      safetyInvariantPassRate: 1,
    });

    expect(evaluation.samples).toBe(16);
    expect(evaluation.updatedAt).toBe("2026-07-20T08:00:00.000Z");
    expect(evaluation.metrics.find((metric) => metric.key === "passed")?.value).toBe("16 / 16");
    expect(evaluation.metrics.find((metric) => metric.key === "passRate")?.value).toBe("100%");
    expect(evaluation.metrics.find((metric) => metric.key === "safetyInvariantPassRate")?.value).toBe("100%");
    expect(evaluation.metrics.find((metric) => metric.key === "safetyInvariantPassRate")?.label).toBe("Safety Case Agreement");
  });
});
