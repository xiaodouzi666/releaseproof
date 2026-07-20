export type ViewName = "workspace" | "architecture";

export type WorkflowStatus =
  | "received"
  | "analyzing"
  | "planning"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "verifying"
  | "completed"
  | "denied"
  | "rejected"
  | "rolling_back"
  | "rolled_back"
  | "revoked"
  | "failed";

export interface Scenario {
  id: string;
  name: string;
  description: string;
  requestText: string;
  riskHint?: string;
  tag?: string;
}

export interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  status: "pending" | "active" | "completed" | "blocked" | "failed";
  actor?: string;
  tool?: string;
  timestamp?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export interface AccessRequest {
  requester: string;
  requesterRole?: string;
  resource: string;
  accessLevel: string;
  reason: string;
  duration: string;
  environment?: string;
  source?: string;
}

export interface RiskAssessment {
  score: number;
  level: "low" | "medium" | "high" | "critical" | "unknown";
  reasons: string[];
}

export interface PermissionChange {
  id: string;
  action: "add" | "remove" | "keep" | "deny";
  permission: string;
  scope?: string;
  from?: string;
  to?: string;
  reason?: string;
}

export interface PolicyEvidence {
  id: string;
  policy: string;
  verdict: "pass" | "warn" | "block" | "info";
  explanation: string;
  reference?: string;
}

export interface WorkflowMetadata {
  providerMode?: string;
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
  calls?: number;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  region?: string;
  disclosure?: string;
}

export interface Workflow {
  id: string;
  status: WorkflowStatus;
  createdAt?: string;
  updatedAt?: string;
  scenarioId?: string;
  requestText?: string;
  extractedRequest?: AccessRequest;
  risk?: RiskAssessment;
  permissionDiff: PermissionChange[];
  policyEvidence: PolicyEvidence[];
  timeline: TimelineEvent[];
  approval?: {
    status: "pending" | "approved" | "rejected";
    decidedAt?: string;
    decidedBy?: string;
    note?: string;
  };
  execution?: {
    grantId?: string;
    verified?: boolean;
    expiresAt?: string;
    revocationJobId?: string;
    rollbackAvailable?: boolean;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  metadata: WorkflowMetadata;
  raw: unknown;
}

export interface HealthInfo {
  ok: boolean;
  status: string;
  service?: string;
  version?: string;
  providerMode?: string;
  model?: string;
  region?: string;
}

export interface MetricDatum {
  key: string;
  label: string;
  value: string;
  detail?: string;
}

export interface EvaluationInfo {
  title: string;
  samples?: number;
  metrics: MetricDatum[];
  updatedAt?: string;
}
