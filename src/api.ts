import type {
  AccessRequest,
  EvaluationInfo,
  HealthInfo,
  MetricDatum,
  PermissionChange,
  PolicyEvidence,
  RiskAssessment,
  Scenario,
  TimelineEvent,
  Workflow,
  WorkflowMetadata,
  WorkflowStatus,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const record = (value: unknown): UnknownRecord => (isRecord(value) ? value : {});

const firstDefined = (...values: unknown[]): unknown => values.find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
};

const numberValue = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const booleanValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
};

const stringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        const entry = record(item);
        return stringValue(firstDefined(entry.message, entry.reason, entry.title, entry.detail));
      })
      .filter(Boolean);
  }
  if (typeof value === "string") return value ? [value] : [];
  return [];
};

const humanize = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

function unwrap(value: unknown, key: string): unknown {
  const data = record(value);
  return firstDefined(data[key], record(data.data)[key], data.data, value);
}

function normalizeStatus(value: unknown): WorkflowStatus {
  const status = stringValue(value, "received").toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, WorkflowStatus> = {
    created: "received",
    queued: "received",
    pending: "received",
    extracting: "analyzing",
    enriching_context: "analyzing",
    extracted: "planning",
    assessing: "planning",
    policy_check: "planning",
    evaluating_policy: "planning",
    risk_assessment: "planning",
    waiting_approval: "awaiting_approval",
    pending_approval: "awaiting_approval",
    approval_required: "awaiting_approval",
    waiting_for_approval: "awaiting_approval",
    applying: "executing",
    granted: "verifying",
    verify: "verifying",
    succeeded: "completed",
    done: "completed",
    cancelled: "rejected",
    rollback: "rolling_back",
    reverted: "rolled_back",
    error: "failed",
  };
  const normalized = aliases[status] ?? status;
  const valid: WorkflowStatus[] = [
    "received",
    "analyzing",
    "planning",
    "awaiting_approval",
    "approved",
    "executing",
    "verifying",
    "completed",
    "denied",
    "rejected",
    "rolling_back",
    "rolled_back",
    "revoked",
    "failed",
  ];
  return valid.includes(normalized as WorkflowStatus) ? (normalized as WorkflowStatus) : "received";
}

function normalizeEventStatus(value: unknown): TimelineEvent["status"] {
  const status = stringValue(value, "completed").toLowerCase();
  if (["running", "in_progress", "processing", "active"].includes(status)) return "active";
  if (["pending", "queued", "waiting"].includes(status)) return "pending";
  if (["blocked", "awaiting_approval", "paused"].includes(status)) return "blocked";
  if (["failed", "error", "rejected"].includes(status)) return "failed";
  return "completed";
}

function normalizeTimeline(value: unknown): TimelineEvent[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const event = record(item);
    const type = stringValue(firstDefined(event.type, event.kind, event.event), "agent_step");
    const details = { ...record(firstDefined(event.details, event.metadata, event.data)) };
    if (event.sequence !== undefined) details.sequence = event.sequence;
    if (event.previousHash !== undefined) details.previousHash = event.previousHash;
    if (event.hash !== undefined) details.hash = event.hash;
    return {
      id: stringValue(firstDefined(event.id, event.eventId), `event-${index}`),
      type,
      title: stringValue(firstDefined(event.title, event.name, event.step), humanize(type)),
      message: stringValue(firstDefined(event.message, event.description, event.summary, event.reason)),
      status: normalizeEventStatus(firstDefined(event.status, event.state)),
      actor: stringValue(firstDefined(event.actor, event.agent), undefined),
      tool: stringValue(firstDefined(event.tool, event.toolName, details.tool), undefined),
      timestamp: stringValue(firstDefined(event.timestamp, event.createdAt, event.at), undefined),
      durationMs: numberValue(firstDefined(event.durationMs, event.latencyMs), undefined as unknown as number),
      details: Object.keys(details).length ? details : undefined,
    };
  });
}

function normalizeToolTraces(value: unknown): TimelineEvent[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const trace = record(entry);
    const name = stringValue(trace.name, "tool.call");
    const rawStatus = stringValue(trace.status, "succeeded").toLowerCase();
    return {
      id: `tool-${stringValue(trace.id, String(index))}`,
      type: "tool_call",
      title: humanize(name),
      message: rawStatus === "failed"
        ? stringValue(trace.error, "Tool call failed")
        : rawStatus === "running"
          ? "Tool call in progress"
          : "Tool response validated",
      status: rawStatus === "failed" ? "failed" : rawStatus === "running" ? "active" : "completed",
      actor: "control plane",
      tool: name,
      timestamp: stringValue(firstDefined(trace.finishedAt, trace.startedAt), undefined),
      durationMs: numberValue(trace.latencyMs, undefined as unknown as number),
      details: Object.keys(record(trace.output)).length ? record(trace.output) : undefined,
    };
  });
}

function normalizeRequest(value: unknown): AccessRequest | undefined {
  const item = record(value);
  if (!Object.keys(item).length) return undefined;
  const requesterRecord = record(firstDefined(item.requester, item.identity, item.user));
  const resourceRecord = record(firstDefined(item.resource, item.target));
  return {
    requester: stringValue(
      firstDefined(
        typeof item.requester === "string" ? item.requester : undefined,
        item.requesterName,
        requesterRecord.name,
        requesterRecord.email,
        item.subjectEmail,
        item.requesterEmail,
        item.user,
      ),
      "Unknown vendor recipient",
    ),
    requesterRole: stringValue(firstDefined(item.requesterRole, item.role, requesterRecord.role), undefined),
    resource: stringValue(
      firstDefined(
        typeof item.resource === "string" ? item.resource : undefined,
        item.resourceName,
        resourceRecord.name,
        resourceRecord.id,
        item.resourceId,
        item.target,
      ),
      "Unspecified dataset",
    ),
    accessLevel: stringValue(firstDefined(item.accessLevel, item.permission, item.requestedAccess, item.requestedRole, item.access), "Unspecified"),
    reason: stringValue(firstDefined(item.reason, item.justification, item.businessReason), "No release purpose supplied"),
    duration: item.durationHours !== undefined
      ? `${numberValue(item.durationHours)} hours`
      : stringValue(firstDefined(item.duration, item.requestedDuration, item.ttl, item.expiresIn), "Not specified"),
    environment: stringValue(firstDefined(item.environment, resourceRecord.environment), undefined),
    source: stringValue(item.source, undefined),
  };
}

function normalizeRisk(value: unknown): RiskAssessment | undefined {
  const item = record(value);
  if (!Object.keys(item).length && typeof value !== "number") return undefined;
  const score = Math.min(100, Math.max(0, numberValue(firstDefined(item.score, item.riskScore, value))));
  const inferredLevel = score >= 85 ? "critical" : score >= 55 ? "high" : score >= 25 ? "medium" : "low";
  const rawLevel = stringValue(firstDefined(item.risk, item.level, item.riskLevel), inferredLevel).toLowerCase();
  const level = (["low", "medium", "high", "critical"].includes(rawLevel) ? rawLevel : "unknown") as RiskAssessment["level"];
  return {
    score,
    level,
    reasons: stringArray(firstDefined(item.reasons, item.factors, item.findings, item.summary)),
  };
}

function normalizePermissionDiff(value: unknown): PermissionChange[] {
  const diffRecord = record(value);
  const source = Array.isArray(value)
    ? value
    : [
        ...((Array.isArray(firstDefined(diffRecord.add, diffRecord.additions)) ? firstDefined(diffRecord.add, diffRecord.additions) : []) as unknown[]).map((item) => ({ item, action: "add" })),
        ...((Array.isArray(firstDefined(diffRecord.remove, diffRecord.removals)) ? firstDefined(diffRecord.remove, diffRecord.removals) : []) as unknown[]).map((item) => ({ item, action: "remove" })),
        ...((Array.isArray(diffRecord.unchanged) ? diffRecord.unchanged : []) as unknown[]).map((item) => ({ item, action: "keep" })),
      ];
  return source.map((entry, index) => {
    const wrapper = record(entry);
    const rawItem = firstDefined(wrapper.item, entry);
    const item = record(rawItem);
    const rawAction = stringValue(firstDefined(wrapper.action, item.action, item.operation, item.change), "add").toLowerCase();
    const action = (["add", "remove", "keep", "deny"].includes(rawAction) ? rawAction : "add") as PermissionChange["action"];
    return {
      id: stringValue(firstDefined(item.id, item.permissionId), `release-scope-${index}`),
      action,
      permission: stringValue(firstDefined(item.permission, item.name, item.role, item.entitlement, typeof rawItem === "string" ? rawItem : undefined), "Release scope"),
      scope: stringValue(firstDefined(item.scope, item.resource, item.target), undefined),
      from: stringValue(firstDefined(item.from, item.current), undefined),
      to: stringValue(firstDefined(item.to, item.proposed, item.value), undefined),
      reason: stringValue(firstDefined(item.reason, item.rationale, item.explanation), undefined),
    };
  });
}

function normalizePolicyEvidence(value: unknown): PolicyEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const item = record(entry);
    const rawVerdict = stringValue(firstDefined(item.verdict, item.status, item.result, item.decision, item.effect), "info").toLowerCase();
    const verdict = (
      ["pass", "allow", "allowed", "compliant"].includes(rawVerdict)
        ? "pass"
        : ["warn", "warning", "review", "constrain"].includes(rawVerdict)
          ? "warn"
          : ["block", "deny", "denied", "fail", "failed"].includes(rawVerdict)
            ? "block"
            : "info"
    ) as PolicyEvidence["verdict"];
    return {
      id: stringValue(firstDefined(item.id, item.policyId), `policy-${index}`),
      policy: stringValue(firstDefined(item.policy, item.name, item.title, item.rule), "Policy check"),
      verdict,
      explanation: stringValue(firstDefined(item.explanation, item.reason, item.message, item.description, item.detail)),
      reference: stringValue(firstDefined(item.reference, item.section, item.source), undefined),
    };
  });
}

function normalizeMetadata(...sources: unknown[]): WorkflowMetadata {
  const source = Object.assign({}, ...sources.map(record));
  const usage = record(source.usage);
  return {
    providerMode: stringValue(firstDefined(source.providerMode, source.mode, source.provider), undefined),
    provider: stringValue(source.provider, undefined),
    model: stringValue(firstDefined(source.model, source.modelName), undefined),
    fallbackUsed: booleanValue(firstDefined(source.fallbackUsed, source.fallback), false),
    calls: numberValue(source.calls, undefined as unknown as number),
    latencyMs: numberValue(firstDefined(source.latencyMs, source.durationMs), undefined as unknown as number),
    inputTokens: numberValue(firstDefined(source.inputTokens, source.promptTokens, usage.inputTokens, usage.prompt_tokens), undefined as unknown as number),
    outputTokens: numberValue(firstDefined(source.outputTokens, source.completionTokens, usage.outputTokens, usage.completion_tokens), undefined as unknown as number),
    estimatedCostUsd: numberValue(firstDefined(source.estimatedCostUsd, source.costUsd, source.cost), undefined as unknown as number),
    region: stringValue(source.region, undefined),
    disclosure: stringValue(source.disclosure, undefined),
  };
}

export function normalizeWorkflow(value: unknown): Workflow {
  const input = unwrap(value, "workflow");
  const item = record(input);
  const analysis = record(item.analysis);
  const plan = record(firstDefined(item.plan, item.proposal));
  const approvalData = record(firstDefined(item.approval, item.humanApproval));
  const executionData = record(firstDefined(item.execution, item.grant, item.result));
  const verificationData = record(item.verification);
  const errorData = record(item.error);
  const requestCandidate = firstDefined(item.extractedRequest, item.normalizedRequest, analysis.extractedRequest, analysis.request, item.request);
  const rawApprovalStatus = stringValue(firstDefined(approvalData.status, approvalData.decision, item.approvalStatus), "pending").toLowerCase();
  const approvalStatus = (rawApprovalStatus === "approved" ? "approved" : rawApprovalStatus === "rejected" || rawApprovalStatus === "denied" ? "rejected" : "pending") as "pending" | "approved" | "rejected";

  return {
    id: stringValue(firstDefined(item.id, item.workflowId, item.requestId), "pending"),
    status: normalizeStatus(firstDefined(item.status, item.state, item.phase)),
    createdAt: stringValue(firstDefined(item.createdAt, item.created_at), undefined),
    updatedAt: stringValue(firstDefined(item.updatedAt, item.updated_at), undefined),
    scenarioId: stringValue(item.scenarioId, undefined),
    requestText: stringValue(firstDefined(item.requestText, record(item.request).text, typeof item.request === "string" ? item.request : undefined), undefined),
    extractedRequest: normalizeRequest(requestCandidate),
    risk: normalizeRisk(firstDefined(item.risk, item.riskAssessment, item.decision, analysis.risk, plan.risk)),
    permissionDiff: normalizePermissionDiff(firstDefined(item.permissionDiff, item.diff, item.proposedChanges, plan.permissionDiff, plan.changes, [])),
    policyEvidence: normalizePolicyEvidence(firstDefined(item.policyEvidence, record(item.decision).findings, item.evidence, item.policies, analysis.policyEvidence, plan.evidence, [])),
    timeline: [
      ...normalizeTimeline(firstDefined(item.timeline, item.events, item.auditTrail, item.auditLog, [])),
      ...normalizeToolTraces(item.toolTraces),
    ].sort((a, b) => {
      if (!a.timestamp || !b.timestamp) return 0;
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }),
    approval: Object.keys(approvalData).length || item.approvalStatus
      ? {
          status: approvalStatus,
          decidedAt: stringValue(firstDefined(approvalData.decidedAt, approvalData.timestamp), undefined),
          decidedBy: stringValue(firstDefined(approvalData.decidedBy, approvalData.reviewer, approvalData.approver), undefined),
          note: stringValue(firstDefined(approvalData.note, approvalData.reason), undefined),
        }
      : undefined,
    execution: Object.keys(executionData).length
      ? {
          grantId: stringValue(firstDefined(executionData.grantId, executionData.id), undefined),
          verified: booleanValue(firstDefined(executionData.verified, executionData.verificationPassed, verificationData.verified), false),
          expiresAt: stringValue(firstDefined(executionData.expiresAt, executionData.expiry), undefined),
          revocationJobId: stringValue(firstDefined(executionData.revocationJobId, executionData.revocationId), undefined),
          rollbackAvailable: booleanValue(
            firstDefined(executionData.rollbackAvailable, executionData.canRollback, executionData.status === "active"),
            false,
          ),
        }
      : undefined,
    error: Object.keys(errorData).length
      ? {
          code: stringValue(errorData.code, "WORKFLOW_FAILED"),
          message: stringValue(errorData.message, "The workflow failed closed."),
          retryable: booleanValue(errorData.retryable, false),
        }
      : undefined,
    metadata: normalizeMetadata(item.metadata, analysis.metadata, item.provider, item.model),
    raw: input,
  };
}

export function normalizeScenarioList(value: unknown): Scenario[] {
  const input = unwrap(value, "scenarios");
  if (!Array.isArray(input)) return [];
  return input.map((entry, index) => {
    const item = record(entry);
    return {
      id: stringValue(firstDefined(item.id, item.scenarioId, item.slug), `scenario-${index}`),
      name: stringValue(firstDefined(item.name, item.title), `Scenario ${index + 1}`),
      description: stringValue(firstDefined(item.description, item.summary)),
      requestText: stringValue(firstDefined(item.requestText, item.sampleRequest, item.prompt, item.text)),
      riskHint: stringValue(firstDefined(item.riskHint, item.riskLevel, item.risk, item.expectedRisk), undefined),
      tag: stringValue(firstDefined(item.tag, item.category, item.eyebrow), undefined),
    };
  });
}

export function normalizeHealth(value: unknown): HealthInfo {
  const input = unwrap(value, "health");
  const item = record(input);
  const model = record(item.model);
  const status = stringValue(firstDefined(item.status, item.state), "unavailable");
  return {
    ok: booleanValue(item.ok, ["ok", "healthy", "ready", "up"].includes(status.toLowerCase())),
    status,
    service: stringValue(item.service, undefined),
    version: stringValue(item.version, undefined),
    providerMode: stringValue(firstDefined(item.providerMode, item.mode, item.provider, model.mode), undefined),
    model: stringValue(firstDefined(item.modelName, model.model), undefined),
    region: stringValue(item.region, undefined),
  };
}

const isRateMetric = (key: string): boolean => /(?:rate|ratio|percentage|percent)$/i.test(key);

const formatMetricValue = (value: unknown, asRate = false): string => {
  if (typeof value === "number") {
    if (asRate) return `${Math.round((value <= 1 ? value * 100 : value) * 100) / 100}%`;
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return stringValue(value, "—");
};

export function normalizeMetrics(value: unknown): MetricDatum[] {
  const input = unwrap(value, "metrics");
  const source = record(input);
  const arraySource = Array.isArray(input) ? input : Array.isArray(source.items) ? source.items : undefined;
  if (arraySource) {
    return arraySource.map((entry, index) => {
      const item = record(entry);
      const key = stringValue(firstDefined(item.key, item.id, item.name), `metric-${index}`);
      return {
        key,
        label: stringValue(firstDefined(item.label, item.name), humanize(key)),
        value: formatMetricValue(
          firstDefined(item.displayValue, item.value, item.score),
          isRateMetric(key) || stringValue(item.unit, "").trim() === "%",
        ),
        detail: stringValue(firstDefined(item.detail, item.description, item.unit), undefined),
      };
    });
  }
  const ignored = new Set(["generatedAt", "updatedAt", "timestamp", "title", "status"]);
  const labelOverrides: Record<string, string> = {
    totalWorkflows: "Total Release Runs",
    completionRate: "Proven Release Rate",
    approvalRate: "Owner Approval Rate",
    rollbackRate: "Verified Recall Rate",
    denialRate: "Policy Denial Rate",
    toolSuccessRate: "Tool Success Rate",
    averageTimeToDecisionMs: "Release Decision Latency",
    averageToolLatencyMs: "Tool Latency",
  };
  const base = Object.entries(source)
    .filter(([key, entry]) => !ignored.has(key) && !isRecord(entry) && !Array.isArray(entry))
    .map(([key, entry]) => ({
      key,
      label: labelOverrides[key] ?? humanize(key),
      value: key.endsWith("Ms")
        ? `${formatMetricValue(entry)} ms`
        : formatMetricValue(entry, isRateMetric(key)),
    }));
  const qwen = record(source.qwen);
  if (Object.keys(qwen).length) {
    if (qwen.calls !== undefined) base.push({ key: "qwenCalls", label: "Qwen Calls", value: formatMetricValue(qwen.calls) });
    if (qwen.latencyMs !== undefined) base.push({ key: "qwenLatency", label: "Qwen Latency", value: `${formatMetricValue(qwen.latencyMs)} ms` });
  }
  const priority = [
    "totalWorkflows",
    "completionRate",
    "toolSuccessRate",
    "averageTimeToDecisionMs",
    "qwenCalls",
    "qwenLatency",
  ];
  return [...base].sort((left, right) => {
    const leftIndex = priority.indexOf(left.key);
    const rightIndex = priority.indexOf(right.key);
    if (leftIndex === -1 && rightIndex === -1) return 0;
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

export function normalizeEvaluation(value: unknown): EvaluationInfo {
  const input = unwrap(value, "evaluation");
  const item = record(input);
  const hasKnownEvaluationShape = item.passRate !== undefined || item.safetyInvariantPassRate !== undefined;
  const knownMetrics: MetricDatum[] = hasKnownEvaluationShape
    ? [
        { key: "passRate", label: "Case Pass Rate", value: formatMetricValue(item.passRate, true) },
        { key: "safetyInvariantPassRate", label: "Safety Case Agreement", value: formatMetricValue(item.safetyInvariantPassRate, true) },
        { key: "passed", label: "Cases Passed", value: `${formatMetricValue(item.passed)} / ${formatMetricValue(item.total)}` },
        { key: "policyVersion", label: "Policy Version", value: formatMetricValue(item.policyVersion) },
      ]
    : [];
  return {
    title: stringValue(firstDefined(item.title, item.name), "Safety evaluation"),
    samples: numberValue(firstDefined(item.samples, item.sampleCount, item.totalCases, item.total), undefined as unknown as number),
    metrics: knownMetrics.length ? knownMetrics : normalizeMetrics(firstDefined(item.metrics, item.results, input)),
    updatedAt: stringValue(firstDefined(item.updatedAt, item.timestamp, item.generatedAt), undefined),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const errorBody = record(record(payload).error);
    const message = stringValue(firstDefined(record(payload).message, errorBody.message, record(payload).error, payload), `Request failed (${response.status})`);
    throw new Error(message);
  }
  return payload as T;
}

export const api = {
  async scenarios(): Promise<Scenario[]> {
    return normalizeScenarioList(await request<unknown>("/api/scenarios"));
  },
  async createWorkflow(body: { requestText: string; scenarioId?: string; imageDataUrl?: string }): Promise<Workflow> {
    return normalizeWorkflow(await request<unknown>("/api/workflows", {
      method: "POST",
      headers: { "Idempotency-Key": globalThis.crypto?.randomUUID?.() ?? `create-${Date.now()}` },
      body: JSON.stringify(body),
    }));
  },
  async workflow(id: string): Promise<Workflow> {
    return normalizeWorkflow(await request<unknown>(`/api/workflows/${encodeURIComponent(id)}`));
  },
  async action(
    id: string,
    action: "approve" | "reject" | "rollback",
    detail?: { approver?: string; note?: string },
  ): Promise<Workflow> {
    return normalizeWorkflow(
      await request<unknown>(`/api/workflows/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        headers: { "Idempotency-Key": globalThis.crypto?.randomUUID?.() ?? `${action}-${id}-${Date.now()}` },
        body: JSON.stringify(detail ?? {}),
      }),
    );
  },
  async health(): Promise<HealthInfo> {
    return normalizeHealth(await request<unknown>("/api/health"));
  },
  async metrics(): Promise<MetricDatum[]> {
    return normalizeMetrics(await request<unknown>("/api/metrics"));
  },
  async evaluation(): Promise<EvaluationInfo> {
    return normalizeEvaluation(await request<unknown>("/api/evaluation"));
  },
};

export const apiInternals = { normalizeStatus, normalizeTimeline };
