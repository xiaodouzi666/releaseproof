export const WORKFLOW_STATUSES = [
  "queued",
  "extracting",
  "enriching_context",
  "evaluating_policy",
  "planning",
  "awaiting_approval",
  "approved",
  "executing",
  "verifying",
  "completed",
  "rejected",
  "denied",
  "rolling_back",
  "rolled_back",
  "failed",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ModelMode = "live-qwen" | "recorded-demo";
export type DecisionOutcome = "allow" | "requires_approval" | "deny";
export type AuditActor = "system" | "qwen" | "policy-engine" | "approver" | "requester";

export interface Scenario {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  requestText: string;
  expectedOutcome: DecisionOutcome;
  expectedRisk: RiskLevel;
  tags: string[];
}

export interface ExtractedAccessRequest {
  requesterEmail: string;
  subjectEmail: string;
  resourceId: string;
  requestedRole: "viewer" | "contributor" | "operator" | "admin";
  requestedActions: string[];
  durationHours: number;
  justification: string;
  ticketId?: string;
  confidence: number;
  source: "text" | "vision" | "text+vision";
}

export interface DirectoryUser {
  id: string;
  email: string;
  displayName: string;
  department: string;
  managerEmail: string;
  employmentType: "employee" | "contractor";
  active: boolean;
  mfaEnrolled: boolean;
  clearance: "standard" | "confidential" | "restricted";
}

export interface ResourceProfile {
  id: string;
  name: string;
  environment: "development" | "staging" | "production";
  classification: "internal" | "confidential" | "restricted";
  ownerEmail: string;
  allowedRoles: Array<ExtractedAccessRequest["requestedRole"]>;
}

export interface TicketEvidence {
  ticketId: string;
  title: string;
  status: "open" | "in_progress" | "closed";
  ownerEmail: string;
  referenceOnly: true;
}

export interface AccessGrant {
  grantId: string;
  subjectEmail: string;
  resourceId: string;
  role: ExtractedAccessRequest["requestedRole"];
  actions: string[];
  createdAt: string;
  expiresAt: string;
  status: "active" | "revoked";
  idempotencyKey: string;
  revokedAt?: string;
}

export interface PolicyFinding {
  id: string;
  severity: RiskLevel;
  title: string;
  detail: string;
  effect: "permit" | "constrain" | "deny";
}

export interface PolicyDecision {
  outcome: DecisionOutcome;
  risk: RiskLevel;
  score: number;
  requestedRole: ExtractedAccessRequest["requestedRole"];
  effectiveRole: ExtractedAccessRequest["requestedRole"];
  effectiveActions: string[];
  maxDurationHours: number;
  requiresHumanApproval: boolean;
  findings: PolicyFinding[];
  policyVersion: string;
}

export interface AccessDiff {
  resourceId: string;
  subjectEmail: string;
  before: { role: string | null; actions: string[]; expiresAt?: string };
  after: { role: string; actions: string[]; expiresAt: string };
  additions: string[];
  removals: string[];
  unchanged: string[];
  summary: string;
}

export interface ToolTrace {
  id: string;
  name:
    | "directory.lookup"
    | "resource.lookup"
    | "access.current"
    | "ticket.lookup"
    | "policy.evaluate"
    | "access.diff"
    | "iam.grant"
    | "iam.verify"
    | "iam.revoke";
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt?: string;
  latencyMs?: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

export interface VerificationResult {
  verified: boolean;
  checkedAt: string;
  expectedRole: string;
  observedRole: string | null;
  expectedActions: string[];
  observedActions: string[];
  expectedExpiresAt: string | null;
  observedExpiresAt: string | null;
  activeGrantCount: number;
  details: string;
}

export interface AuditEvent {
  id: string;
  workflowId: string;
  sequence: number;
  type: string;
  timestamp: string;
  actor: AuditActor;
  message: string;
  data?: Record<string, unknown>;
  previousHash: string | null;
  hash: string;
}

export interface ModelMetadata {
  mode: ModelMode;
  provider: "Qwen Cloud" | "deterministic fixture";
  model: string;
  fallbackModel?: string;
  fallbackUsed: boolean;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  disclosure: string;
}

export interface ApprovalRecord {
  decision: "approved" | "rejected";
  approver: string;
  note?: string;
  decidedAt: string;
}

export interface Workflow {
  id: string;
  requestText: string;
  scenarioId?: string;
  hasImage: boolean;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  extractedRequest?: ExtractedAccessRequest;
  directoryUser?: DirectoryUser;
  resource?: ResourceProfile;
  ticketEvidence?: TicketEvidence;
  currentAccess: AccessGrant[];
  decision?: PolicyDecision;
  diff?: AccessDiff;
  proposedExpiresAt?: string;
  toolPlan?: string[];
  toolTraces: ToolTrace[];
  approval?: ApprovalRecord;
  grant?: AccessGrant;
  verification?: VerificationResult;
  rollbackVerification?: VerificationResult;
  events: AuditEvent[];
  model: ModelMetadata;
  error?: { code: string; message: string; retryable: boolean };
}

export interface WorkflowListResponse {
  workflows: Workflow[];
  total: number;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  service: "grantguard-api";
  version: string;
  deploymentTarget: string;
  timestamp: string;
  uptimeSeconds: number;
  model: Pick<ModelMetadata, "mode" | "provider" | "model" | "disclosure">;
  store: { mode: "file" | "memory"; healthy: boolean; detail?: string };
}

export interface MetricsResponse {
  generatedAt: string;
  totalWorkflows: number;
  byStatus: Partial<Record<WorkflowStatus, number>>;
  completionRate: number;
  approvalRate: number;
  rollbackRate: number;
  denialRate: number;
  averageTimeToDecisionMs: number;
  averageToolLatencyMs: number;
  toolSuccessRate: number;
  qwen: {
    liveWorkflows: number;
    recordedDemoWorkflows: number;
    calls: number;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
  };
}

export interface EvaluationCaseResult {
  id: string;
  category: string;
  expectedOutcome: DecisionOutcome;
  actualOutcome: DecisionOutcome;
  expectedRisk: RiskLevel;
  actualRisk: RiskLevel;
  passed: boolean;
  invariant: string;
}

export interface EvaluationResponse {
  generatedAt: string;
  policyVersion: string;
  total: number;
  passed: number;
  passRate: number;
  safetyInvariantPassRate: number;
  cases: EvaluationCaseResult[];
  note: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
