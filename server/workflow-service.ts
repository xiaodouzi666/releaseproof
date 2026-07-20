import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  AuditActor,
  AuditEvent,
  DirectoryUser,
  ExtractedAccessRequest,
  MetricsResponse,
  ResourceProfile,
  TicketEvidence,
  ToolTrace,
  Workflow,
  WorkflowStatus,
} from "../shared/contracts.js";
import { evaluatePolicy } from "./policy.js";
import { QwenClient, mergeModelStats, type ContextToolCall } from "./qwen.js";
import { findScenario } from "./scenarios.js";
import { StoreNotFoundError, WorkflowStore } from "./store.js";
import {
  assertSandboxShareIsCurrent,
  calculateReleaseDiff,
  ExpiredProposalError,
  createShare,
  getCurrentShares,
  lookupAgreement,
  lookupDataset,
  lookupRecipient,
  reconcileSandboxShareStates,
  restoreExpiredShareBaseline,
  restoreShareBaseline,
  StaleGrantError,
  verifyShare,
} from "./tools.js";

export class WorkflowConflictError extends Error {
  constructor(
    message: string,
    public readonly currentStatus: WorkflowStatus,
  ) {
    super(message);
    this.name = "WorkflowConflictError";
  }
}

export interface CreateWorkflowInput {
  requestText: string;
  scenarioId?: string;
  imageDataUrl?: string;
}

interface CommitOptions {
  type: string;
  actor: AuditActor;
  message: string;
  data?: Record<string, unknown>;
  expectedStatuses?: WorkflowStatus[];
  mutate?: (workflow: Workflow) => void;
}

const TERMINAL_STATUSES = new Set<WorkflowStatus>([
  "completed",
  "rejected",
  "denied",
  "rolled_back",
  "failed",
]);

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

function makeAuditEvent(
  workflow: Workflow,
  input: Omit<AuditEvent, "id" | "workflowId" | "sequence" | "timestamp" | "previousHash" | "hash">,
): AuditEvent {
  const previous = workflow.events.at(-1);
  const eventWithoutHash = {
    id: `evt_${randomUUID().replaceAll("-", "").slice(0, 18)}`,
    workflowId: workflow.id,
    sequence: workflow.events.length + 1,
    timestamp: new Date().toISOString(),
    actor: input.actor,
    type: input.type,
    message: input.message,
    ...(input.data !== undefined ? { data: input.data } : {}),
    previousHash: previous?.hash ?? null,
  };
  const hash = createHash("sha256").update(canonicalJson(eventWithoutHash)).digest("hex");
  return { ...eventWithoutHash, hash };
}

function traceOutput(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { result: null };
  if (Array.isArray(value)) return { result: value as unknown[] };
  if (typeof value === "object") return structuredClone(value as Record<string, unknown>);
  return { result: value };
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function canonicalActiveBaseline(grants: NonNullable<Workflow["currentAccess"]>, now = Date.now()): string {
  return JSON.stringify(
    grants
      .filter((grant) => grant.status === "active" && new Date(grant.expiresAt).getTime() > now)
      .map((grant) => ({
        grantId: grant.grantId,
        role: grant.role,
        actions: [...new Set(grant.actions)].sort(),
        expiresAt: new Date(grant.expiresAt).toISOString(),
      }))
      .sort((a, b) => a.grantId.localeCompare(b.grantId)),
  );
}

function completeTrustedContextPlan(
  calls: ContextToolCall[],
  request: ExtractedAccessRequest,
): ContextToolCall[] {
  const trusted: ContextToolCall[] = [];
  for (const call of calls) {
    if (trusted.some((item) => item.name === call.name)) continue;
    if (call.name === "recipient.lookup") {
      trusted.push({
        name: call.name,
        arguments: { subjectEmail: request.subjectEmail },
        source: call.source,
        sanitized: call.sanitized || call.arguments.subjectEmail !== request.subjectEmail,
      });
    } else if (call.name === "dataset.lookup") {
      trusted.push({
        name: call.name,
        arguments: { resourceId: request.resourceId },
        source: call.source,
        sanitized: call.sanitized || call.arguments.resourceId !== request.resourceId,
      });
    } else if (call.name === "share.current") {
      trusted.push({
        name: call.name,
        arguments: { subjectEmail: request.subjectEmail, resourceId: request.resourceId },
        source: call.source,
        sanitized:
          call.sanitized ||
          call.arguments.subjectEmail !== request.subjectEmail ||
          call.arguments.resourceId !== request.resourceId,
      });
    } else if (call.name === "agreement.lookup" && request.ticketId) {
      trusted.push({
        name: call.name,
        arguments: { ticketId: request.ticketId },
        source: call.source,
        sanitized: call.sanitized || call.arguments.ticketId !== request.ticketId,
      });
    }
  }

  if (!trusted.some((item) => item.name === "recipient.lookup")) {
    trusted.push({
      name: "recipient.lookup",
      arguments: { subjectEmail: request.subjectEmail },
      source: "mandatory",
      sanitized: false,
    });
  }
  if (!trusted.some((item) => item.name === "dataset.lookup")) {
    trusted.push({
      name: "dataset.lookup",
      arguments: { resourceId: request.resourceId },
      source: "mandatory",
      sanitized: false,
    });
  }
  if (!trusted.some((item) => item.name === "share.current")) {
    trusted.push({
      name: "share.current",
      arguments: { subjectEmail: request.subjectEmail, resourceId: request.resourceId },
      source: "mandatory",
      sanitized: false,
    });
  }
  return trusted;
}

export class WorkflowService {
  private readonly events = new EventEmitter();
  private readonly activeJobs = new Set<string>();
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();
  private readonly stepDelayMs = Math.max(0, Math.min(2_000, Number(process.env.DEMO_STEP_DELAY_MS ?? 300)));

  constructor(
    readonly store: WorkflowStore,
    readonly qwen: QwenClient,
  ) {
    this.events.setMaxListeners(200);
  }

  static async create(): Promise<WorkflowService> {
    const service = new WorkflowService(await WorkflowStore.create(), new QwenClient());
    await service.resumeSafeJobs();
    return service;
  }

  async createWorkflow(input: CreateWorkflowInput, idempotencyKey?: string): Promise<Workflow> {
    if (idempotencyKey) {
      const existing = await this.store.findByIdempotencyKey(`create:${idempotencyKey}`);
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    const id = `wf_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
    const workflowQwen = this.qwenForWorkflow(input.scenarioId);
    const workflow: Workflow = {
      id,
      requestText: input.requestText,
      scenarioId: input.scenarioId,
      hasImage: Boolean(input.imageDataUrl),
      status: "queued",
      createdAt: now,
      updatedAt: now,
      currentAccess: [],
      toolTraces: [],
      events: [],
      model: workflowQwen.metadata(),
    };
    workflow.events.push(
      makeAuditEvent(workflow, {
        type: "workflow.created",
        actor: "requester",
        message: "External data-release request accepted into the ReleaseProof safety workflow.",
        data: {
          scenarioId: input.scenarioId ?? null,
          hasImage: Boolean(input.imageDataUrl),
          modelMode: workflow.model.mode,
        },
      }),
    );
    const created = await this.store.createWorkflow(workflow, idempotencyKey ? `create:${idempotencyKey}` : undefined);
    if (!created.replayed) {
      this.emit(created.workflow.events[0]!, created.workflow);
      this.schedulePreApproval(created.workflow.id, input.imageDataUrl);
    }
    return created.workflow;
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const workflow = await this.store.getWorkflow(id);
    if (!workflow) throw new StoreNotFoundError(id);
    return workflow;
  }

  async listWorkflows(): Promise<Workflow[]> {
    return this.store.listWorkflows();
  }

  async approve(id: string, approver: string, note?: string, idempotencyKey?: string): Promise<Workflow> {
    const current = await this.getWorkflow(id);
    if (["approved", "executing", "verifying", "completed"].includes(current.status)) return current;
    if (
      current.status === "awaiting_approval" &&
      (!current.diff || new Date(current.diff.after.expiresAt).getTime() <= Date.now() + 60_000)
    ) {
      throw new WorkflowConflictError(
        "The reviewed proposal has expired; create a fresh workflow before approval",
        current.status,
      );
    }
    const workflow = await this.commit(id, {
      type: "approval.approved",
      actor: "approver",
      message: `${approver} approved the minimized external release.`,
      data: { approver, note: note ?? null, idempotencyKey: idempotencyKey ?? null },
      expectedStatuses: ["awaiting_approval"],
      mutate: (draft) => {
        if (draft.decision?.outcome === "deny") {
          throw new WorkflowConflictError("A deterministic policy denial cannot be approved", draft.status);
        }
        draft.status = "approved";
        draft.approval = { decision: "approved", approver, note, decidedAt: new Date().toISOString() };
      },
    });
    this.scheduleExecution(id);
    return workflow;
  }

  async reject(id: string, approver: string, note?: string, idempotencyKey?: string): Promise<Workflow> {
    const current = await this.getWorkflow(id);
    if (current.status === "rejected") return current;
    return this.commit(id, {
      type: "approval.rejected",
      actor: "approver",
      message: `${approver} rejected the proposed release. No external share was created.`,
      data: { approver, note: note ?? null, idempotencyKey: idempotencyKey ?? null },
      expectedStatuses: ["awaiting_approval"],
      mutate: (draft) => {
        draft.status = "rejected";
        draft.approval = { decision: "rejected", approver, note, decidedAt: new Date().toISOString() };
      },
    });
  }

  async recall(id: string, actor: string, note?: string, idempotencyKey?: string): Promise<Workflow> {
    const current = await this.getWorkflow(id);
    if (["rolling_back", "rolled_back"].includes(current.status)) return current;
    if (!current.grant) {
      throw new WorkflowConflictError("This workflow did not create a share, so there is nothing to recall", current.status);
    }
    try {
      assertSandboxShareIsCurrent(current.grant.grantId);
    } catch (error) {
      if (error instanceof StaleGrantError) {
        throw new WorkflowConflictError(error.message, current.status);
      }
      throw error;
    }
    const workflow = await this.commit(id, {
      type: "recall.requested",
      actor: "approver",
      message: `${actor} requested immediate recall of the temporary share.`,
      data: { actor, note: note ?? null, idempotencyKey: idempotencyKey ?? null },
      expectedStatuses: ["completed", "failed"],
      mutate: (draft) => {
        draft.status = "rolling_back";
      },
    });
    this.scheduleRollback(id);
    return workflow;
  }

  // Compatibility alias for older clients; new product surfaces call this action "recall".
  async rollback(id: string, actor: string, note?: string, idempotencyKey?: string): Promise<Workflow> {
    return this.recall(id, actor, note, idempotencyKey);
  }

  subscribe(workflowId: string, listener: (event: AuditEvent, workflow: Workflow) => void): () => void {
    const channel = `workflow:${workflowId}`;
    this.events.on(channel, listener);
    return () => this.events.off(channel, listener);
  }

  async metrics(): Promise<MetricsResponse> {
    const workflows = await this.listWorkflows();
    const byStatus: MetricsResponse["byStatus"] = {};
    for (const workflow of workflows) byStatus[workflow.status] = (byStatus[workflow.status] ?? 0) + 1;
    const completed = workflows.filter((item) => item.status === "completed" || item.status === "rolled_back").length;
    const approvals = workflows.filter((item) => item.approval?.decision === "approved").length;
    const decisions = workflows.filter((item) => item.decision);
    const rolledBack = workflows.filter((item) => item.status === "rolled_back").length;
    const denied = workflows.filter((item) => item.status === "denied").length;
    const toolTraces = workflows.flatMap((item) => item.toolTraces).filter((trace) => trace.status !== "running");
    const decisionDurations = workflows
      .map((workflow) => {
        const event = workflow.events.find((item) => item.type === "approval.required" || item.type === "policy.denied");
        return event ? new Date(event.timestamp).getTime() - new Date(workflow.createdAt).getTime() : null;
      })
      .filter((value): value is number => value !== null && value >= 0);

    return {
      generatedAt: new Date().toISOString(),
      totalWorkflows: workflows.length,
      byStatus,
      completionRate: round(workflows.length ? completed / workflows.length : 0),
      approvalRate: round(decisions.length ? approvals / decisions.length : 0),
      recallRate: round(approvals ? rolledBack / approvals : 0),
      rollbackRate: round(approvals ? rolledBack / approvals : 0),
      denialRate: round(decisions.length ? denied / decisions.length : 0),
      averageTimeToDecisionMs: round(
        decisionDurations.length ? decisionDurations.reduce((sum, value) => sum + value, 0) / decisionDurations.length : 0,
      ),
      averageToolLatencyMs: round(
        toolTraces.length ? toolTraces.reduce((sum, trace) => sum + (trace.latencyMs ?? 0), 0) / toolTraces.length : 0,
      ),
      toolSuccessRate: round(
        toolTraces.length ? toolTraces.filter((trace) => trace.status === "succeeded").length / toolTraces.length : 0,
      ),
      qwen: {
        liveWorkflows: workflows.filter((item) => item.model.mode === "live-qwen" && item.model.calls > 0).length,
        recordedDemoWorkflows: workflows.filter((item) => item.model.mode === "recorded-demo").length,
        calls: workflows.reduce((sum, item) => sum + item.model.calls, 0),
        promptTokens: workflows.reduce((sum, item) => sum + item.model.promptTokens, 0),
        completionTokens: workflows.reduce((sum, item) => sum + item.model.completionTokens, 0),
        latencyMs: workflows.reduce((sum, item) => sum + item.model.latencyMs, 0),
      },
    };
  }

  private schedulePreApproval(id: string, imageDataUrl?: string): void {
    setTimeout(() => void this.runExclusive(id, () => this.runPreApproval(id, imageDataUrl)), 0);
  }

  private scheduleExecution(id: string): void {
    setTimeout(() => void this.runExclusive(id, () => this.executeApprovedGrant(id)), 0);
  }

  private scheduleRollback(id: string, expired = false): void {
    setTimeout(() => void this.runExclusive(id, () => this.executeRollback(id, expired)), 0);
  }

  private async runExclusive(id: string, job: () => Promise<void>): Promise<void> {
    if (this.activeJobs.has(id)) return;
    this.activeJobs.add(id);
    try {
      await job();
    } catch (error) {
      await this.failWorkflow(id, error);
    } finally {
      this.activeJobs.delete(id);
    }
  }

  private async runPreApproval(id: string, imageDataUrl?: string): Promise<void> {
    let workflow = await this.commit(id, {
      type: "extraction.started",
      actor: "system",
      message: "Parsing untrusted request content into a validated external-release schema.",
      expectedStatuses: ["queued"],
      mutate: (draft) => {
        draft.status = "extracting";
      },
    });
    await this.pause();

    const workflowQwen = this.qwenForWorkflow(workflow.scenarioId);
    const extraction = await workflowQwen.extract({
      requestText: workflow.requestText,
      scenarioId: workflow.scenarioId,
      imageDataUrl,
    });
    workflow = await this.commit(id, {
      type: "extraction.completed",
      actor: workflow.model.mode === "live-qwen" ? "qwen" : "system",
      message:
        workflow.model.mode === "live-qwen"
          ? "Qwen produced structured recipient, dataset, purpose, tier, field, duration, and agreement fields; Zod validation succeeded."
          : "Recorded-demo fixture produced structured release fields; no live model call was made.",
      data: {
        confidence: extraction.request.confidence,
        source: extraction.request.source,
        model: extraction.stats.model,
        fallbackUsed: extraction.stats.fallbackUsed,
      },
      expectedStatuses: ["extracting"],
      mutate: (draft) => {
        draft.extractedRequest = extraction.request;
        draft.model = mergeModelStats(draft.model, extraction.stats);
        draft.status = "planning";
      },
    });
    await this.pause();

    const extracted = workflow.extractedRequest!;
    const proposedContextPlan = await workflowQwen.planContextTools(extracted);
    const contextPlan = completeTrustedContextPlan(proposedContextPlan.calls, extracted);
    workflow = await this.commit(id, {
      type: "context.plan_selected",
      actor: workflow.model.mode === "live-qwen" ? "qwen" : "system",
      message:
        workflow.model.mode === "live-qwen"
          ? "Qwen selected a read-only context plan; arguments were validated and bound to the trusted extraction."
          : "Recorded-demo mode selected the deterministic read-only context plan; no live function call was claimed.",
      data: {
        calls: contextPlan.map((call) => ({ name: call.name, source: call.source, sanitized: call.sanitized })),
        writeToolsExposed: false,
      },
      expectedStatuses: ["planning"],
      mutate: (draft) => {
        draft.model = mergeModelStats(draft.model, proposedContextPlan.stats);
        draft.toolPlan = [
          ...contextPlan.map((call) => call.name),
          "policy.evaluate",
          "release.diff",
          "human.approval",
        ];
        draft.status = "enriching_context";
      },
    });

    let directoryUser: DirectoryUser | null = null;
    let resource: ResourceProfile | null = null;
    let agreementEvidence: TicketEvidence | null = null;
    let currentAccess = workflow.currentAccess;
    for (const call of contextPlan) {
      if (call.name === "recipient.lookup") {
        directoryUser = await this.runTool(
          id,
          call.name,
          call.arguments,
          () => lookupRecipient(call.arguments.subjectEmail),
          (draft, result) => {
            draft.directoryUser = result ?? undefined;
          },
        );
      } else if (call.name === "dataset.lookup") {
        resource = await this.runTool(
          id,
          call.name,
          call.arguments,
          () => lookupDataset(call.arguments.resourceId),
          (draft, result) => {
            draft.resource = result ?? undefined;
          },
        );
      } else if (call.name === "share.current") {
        currentAccess = await this.runTool(
          id,
          call.name,
          call.arguments,
          () => getCurrentShares(call.arguments.subjectEmail, call.arguments.resourceId),
          (draft, result) => {
            draft.currentAccess = result;
          },
        );
      } else if (call.name === "agreement.lookup") {
        agreementEvidence = await this.runTool(
          id,
          call.name,
          call.arguments,
          () => lookupAgreement(call.arguments.ticketId),
          (draft, result) => {
            draft.ticketEvidence = result ?? undefined;
          },
        );
      }
    }
    await this.pause();

    await this.commit(id, {
      type: "policy.started",
      actor: "policy-engine",
      message: "Running fail-closed deterministic external-release policy.",
      expectedStatuses: ["enriching_context"],
      mutate: (draft) => {
        draft.status = "evaluating_policy";
      },
    });
    const decision = await this.runTool(
      id,
      "policy.evaluate",
      { policyInput: "validated-release+recipient+dataset+agreement+current-shares" },
      async () =>
        evaluatePolicy({
          request: extracted,
          user: directoryUser,
          resource,
          agreement: agreementEvidence,
          currentAccess,
        }),
      (draft, result) => {
        draft.decision = result;
      },
    );
    await this.pause();

    if (decision.outcome === "deny") {
      await this.commit(id, {
        type: "policy.denied",
        actor: "policy-engine",
        message: "Deterministic release policy vetoed the request. Approval and external sharing are disabled.",
        data: { risk: decision.risk, score: decision.score, policyVersion: decision.policyVersion },
        expectedStatuses: ["evaluating_policy"],
        mutate: (draft) => {
          draft.status = "denied";
        },
      });
      return;
    }

    const diff = await this.runTool(
      id,
      "release.diff",
      { subjectEmail: extracted.subjectEmail, resourceId: extracted.resourceId },
      async () => calculateReleaseDiff({ request: extracted, decision, currentAccess }),
      (draft, result) => {
        draft.diff = result;
        draft.proposedExpiresAt = result.after.expiresAt;
      },
    );
    await this.commit(id, {
      type: "approval.required",
      actor: "system",
      message: "Field-minimized release is ready and paused at the mandatory human approval gate.",
      data: {
        risk: decision.risk,
        effectiveRole: decision.effectiveRole,
        expiresAt: diff.after.expiresAt,
        diffSummary: diff.summary,
      },
      expectedStatuses: ["evaluating_policy"],
      mutate: (draft) => {
        draft.status = "awaiting_approval";
      },
    });
  }

  private async executeApprovedGrant(id: string): Promise<void> {
    let workflow = await this.commit(id, {
      type: "execution.started",
      actor: "system",
      message: "Approval gate satisfied. Creating the exact reviewed share in the release sandbox.",
      expectedStatuses: ["approved"],
      mutate: (draft) => {
        draft.status = "executing";
      },
    });
    await this.pause();

    if (!workflow.extractedRequest || !workflow.decision || !workflow.diff) {
      throw new Error("Approved workflow is missing its validated execution inputs");
    }
    const extractedRequest = workflow.extractedRequest;
    const decision = workflow.decision;
    const reviewedDiff = workflow.diff;
    const reviewedBaseline = structuredClone(workflow.currentAccess);

    const executionBaseline = await this.runTool(
      id,
      "share.current",
      {
        subjectEmail: extractedRequest.subjectEmail,
        resourceId: extractedRequest.resourceId,
        phase: "pre-execution-baseline",
      },
      () => getCurrentShares(extractedRequest.subjectEmail, extractedRequest.resourceId),
      () => undefined,
    );
    workflow = await this.getWorkflow(id);
    if (canonicalActiveBaseline(executionBaseline) !== canonicalActiveBaseline(reviewedBaseline)) {
      await this.commit(id, {
        type: "execution.stale_baseline",
        actor: "system",
        message: "Execution stopped because the recipient's effective shares changed after the proposal was reviewed.",
        data: {
          reviewedGrantIds: reviewedBaseline.map((grant) => grant.grantId),
          executionGrantIds: executionBaseline.map((grant) => grant.grantId),
        },
        expectedStatuses: ["executing"],
        mutate: (draft) => {
          draft.status = "failed";
          draft.error = {
            code: "STALE_APPROVAL_BASELINE",
            message: "Share state changed after approval; create and approve a fresh release proposal.",
            retryable: true,
          };
        },
      });
      return;
    }
    const activeBaseline = executionBaseline.filter((grant) => grant.status === "active");
    const baselineGrant = activeBaseline.length === 1 ? activeBaseline[0] : undefined;
    const sameActions =
      Boolean(baselineGrant) &&
      JSON.stringify([...new Set(baselineGrant!.actions)].sort()) ===
        JSON.stringify([...new Set(reviewedDiff.after.actions)].sort());
    const noOp =
      activeBaseline.length === 1 &&
      baselineGrant?.role === reviewedDiff.after.role &&
      sameActions &&
      new Date(baselineGrant.expiresAt).getTime() === new Date(reviewedDiff.after.expiresAt).getTime();
    if (noOp) {
      await this.commit(id, {
        type: "execution.noop",
        actor: "system",
        message: "An existing share already matches the reviewed release; no duplicate share was created.",
        expectedStatuses: ["executing"],
        mutate: (draft) => {
          draft.status = "verifying";
        },
      });
      const verification = await verifyShare({
        subjectEmail: extractedRequest.subjectEmail,
        resourceId: extractedRequest.resourceId,
        expected: {
          grantId: baselineGrant!.grantId,
          role: decision.effectiveRole,
          actions: reviewedDiff.after.actions,
          expiresAt: reviewedDiff.after.expiresAt,
        },
      });
      await this.commit(id, {
        type: "verification.completed",
        actor: "system",
        message: verification.details,
        data: { verified: verification.verified, noOp: true },
        expectedStatuses: ["verifying"],
        mutate: (draft) => {
          draft.verification = verification;
          draft.status = verification.verified ? "completed" : "failed";
          if (!verification.verified) {
            draft.error = { code: "VERIFY_FAILED", message: verification.details, retryable: true };
          }
        },
      });
      return;
    }

    const granted = await this.runTool(
      id,
      "share.grant",
      {
        subjectEmail: extractedRequest.subjectEmail,
        resourceId: extractedRequest.resourceId,
        role: decision.effectiveRole,
        expiresAt: reviewedDiff.after.expiresAt,
      },
      () =>
        createShare({
          subjectEmail: extractedRequest.subjectEmail,
          resourceId: extractedRequest.resourceId,
          role: decision.effectiveRole,
          actions: decision.effectiveActions,
          expiresAt: reviewedDiff.after.expiresAt,
          idempotencyKey: `workflow:${id}:grant:v1`,
          expectedBaseline: reviewedBaseline,
        }),
      (draft, result) => {
        draft.grant = result.grant;
      },
    );
    workflow = await this.commit(id, {
      type: "expiry.scheduled",
      actor: "system",
      message: `Automatic recall scheduled for ${granted.grant.expiresAt}.`,
      data: {
        grantId: granted.grant.grantId,
        replacedGrantIds: granted.replacedGrants.map((grant) => grant.grantId),
        expiresAt: granted.grant.expiresAt,
        replayed: granted.replayed,
      },
      expectedStatuses: ["executing"],
      mutate: (draft) => {
        draft.status = "verifying";
      },
    });
    await this.pause();

    const verification = await this.runTool(
      id,
      "share.verify",
      {
        grantId: granted.grant.grantId,
        expectedRole: decision.effectiveRole,
        expectedActions: decision.effectiveActions,
        expectedExpiresAt: reviewedDiff.after.expiresAt,
      },
      () =>
        verifyShare({
          subjectEmail: extractedRequest.subjectEmail,
          resourceId: extractedRequest.resourceId,
          expected: {
            grantId: granted.grant.grantId,
            role: decision.effectiveRole,
            actions: decision.effectiveActions,
            expiresAt: reviewedDiff.after.expiresAt,
          },
        }),
      (draft, result) => {
        draft.verification = result;
      },
    );

    if (!verification.verified) {
      const restored = await restoreShareBaseline({
        grantId: granted.grant.grantId,
        baseline: workflow.currentAccess,
        idempotencyKey: `workflow:${id}:verification-failure-restore:v1`,
      });
      await this.commit(id, {
        type: "verification.failed_recall",
        actor: "system",
        message: "Read-after-share verification failed; the new release was immediately recalled.",
        data: { details: verification.details },
        expectedStatuses: ["verifying"],
        mutate: (draft) => {
          draft.grant = restored.revokedGrant;
          draft.status = "failed";
          draft.error = { code: "VERIFY_FAILED", message: verification.details, retryable: true };
        },
      });
      return;
    }

    workflow = await this.commit(id, {
      type: "workflow.completed",
      actor: "system",
      message: "The temporary field-minimized share is active and read-after-share verification passed.",
      data: { grantId: granted.grant.grantId, verified: true },
      expectedStatuses: ["verifying"],
      mutate: (draft) => {
        draft.status = "completed";
      },
    });
    this.scheduleExpiry(workflow);
  }

  private async executeRollback(id: string, expired = false): Promise<void> {
    const workflow = await this.getWorkflow(id);
    if (!workflow.grant || !workflow.extractedRequest || !workflow.diff) {
      throw new Error("Recall inputs are incomplete");
    }
    const revoked = await this.runTool(
      id,
      "share.recall",
      { grantId: workflow.grant.grantId, restoreGrantIds: workflow.currentAccess.map((grant) => grant.grantId) },
      () => {
        const input = {
          grantId: workflow.grant!.grantId,
          baseline: workflow.currentAccess,
          idempotencyKey: `workflow:${id}:${expired ? "expiry" : "rollback"}:v1`,
        };
        return expired ? restoreExpiredShareBaseline(input) : restoreShareBaseline(input);
      },
      (draft, result) => {
        draft.grant = result.revokedGrant;
      },
    );
    const baseline = workflow.currentAccess.filter(
      (grant) => grant.status === "active" && new Date(grant.expiresAt).getTime() > Date.now(),
    );
    if (baseline.length > 1) {
      throw new Error("Recall baseline contains multiple active shares and cannot satisfy the unique-state invariant");
    }
    const expectedBaseline = baseline[0]
      ? {
          grantId: baseline[0].grantId,
          role: baseline[0].role,
          actions: baseline[0].actions,
          expiresAt: baseline[0].expiresAt,
        }
      : null;
    const verification = await this.runTool(
      id,
      "share.verify",
      {
        grantId: workflow.grant.grantId,
        expectedRole: expectedBaseline?.role ?? null,
        expectedActions: expectedBaseline?.actions ?? [],
        expectedExpiresAt: expectedBaseline?.expiresAt ?? null,
      },
      () =>
        verifyShare({
          subjectEmail: workflow.extractedRequest!.subjectEmail,
          resourceId: workflow.extractedRequest!.resourceId,
          expected: expectedBaseline,
        }),
      (draft, result) => {
        draft.rollbackVerification = result;
      },
    );
    await this.commit(id, {
      type: "recall.completed",
      actor: "system",
      message: verification.verified
        ? "Recall verified: the temporary share is revoked and the previous release state is restored."
        : "Recall completed, but verification did not match the previous release state.",
      data: {
        grantId: revoked.revokedGrant.grantId,
        restoredGrantIds: revoked.restoredGrants.map((grant) => grant.grantId),
        replayed: revoked.replayed,
        verified: verification.verified,
      },
      expectedStatuses: ["rolling_back"],
      mutate: (draft) => {
        draft.status = verification.verified ? "rolled_back" : "failed";
        if (!verification.verified) {
          draft.error = { code: "ROLLBACK_VERIFY_FAILED", message: verification.details, retryable: true };
        }
      },
    });
    const timer = this.expiryTimers.get(id);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(id);
  }

  private async runTool<T>(
    id: string,
    name: ToolTrace["name"],
    input: Record<string, unknown>,
    call: () => Promise<T>,
    apply: (workflow: Workflow, result: T) => void,
  ): Promise<T> {
    const traceId = `tool_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    await this.commit(id, {
      type: "tool.started",
      actor: name === "policy.evaluate" ? "policy-engine" : "system",
      message: `${name} started.`,
      data: { traceId, tool: name },
      mutate: (draft) => {
        draft.toolTraces.push({ id: traceId, name, status: "running", startedAt, input });
      },
    });
    try {
      const result = await call();
      await this.commit(id, {
        type: "tool.succeeded",
        actor: name === "policy.evaluate" ? "policy-engine" : "system",
        message: `${name} completed successfully.`,
        data: { traceId, tool: name, latencyMs: Date.now() - startedMs },
        mutate: (draft) => {
          const trace = draft.toolTraces.find((item) => item.id === traceId);
          if (!trace) throw new Error(`Missing running trace ${traceId}`);
          trace.status = "succeeded";
          trace.finishedAt = new Date().toISOString();
          trace.latencyMs = Date.now() - startedMs;
          trace.output = traceOutput(result);
          apply(draft, result);
        },
      });
      return result;
    } catch (error) {
      await this.commit(id, {
        type: "tool.failed",
        actor: name === "policy.evaluate" ? "policy-engine" : "system",
        message: `${name} failed safely.`,
        data: { traceId, tool: name, error: (error as Error).message },
        mutate: (draft) => {
          const trace = draft.toolTraces.find((item) => item.id === traceId);
          if (trace) {
            trace.status = "failed";
            trace.finishedAt = new Date().toISOString();
            trace.latencyMs = Date.now() - startedMs;
            trace.error = (error as Error).message;
          }
        },
      });
      throw error;
    }
  }

  private async commit(id: string, options: CommitOptions): Promise<Workflow> {
    let emitted: AuditEvent | undefined;
    const workflow = await this.store.mutateWorkflow(id, (draft) => {
      if (options.expectedStatuses && !options.expectedStatuses.includes(draft.status)) {
        throw new WorkflowConflictError(
          `Action requires status ${options.expectedStatuses.join(" or ")}; current status is ${draft.status}`,
          draft.status,
        );
      }
      options.mutate?.(draft);
      emitted = makeAuditEvent(draft, {
        type: options.type,
        actor: options.actor,
        message: options.message,
        data: options.data,
      });
      draft.events.push(emitted);
    });
    this.emit(emitted!, workflow);
    return workflow;
  }

  private emit(event: AuditEvent, workflow: Workflow): void {
    this.events.emit(`workflow:${workflow.id}`, structuredClone(event), structuredClone(workflow));
  }

  private async failWorkflow(id: string, error: unknown): Promise<void> {
    try {
      const current = await this.getWorkflow(id);
      if (TERMINAL_STATUSES.has(current.status)) return;
      await this.commit(id, {
        type: "workflow.failed",
        actor: "system",
        message: "The workflow failed closed; no further release action will run automatically.",
        data: { error: (error as Error).message },
        mutate: (draft) => {
          draft.status = "failed";
          draft.error = {
            code:
              error instanceof StaleGrantError
                ? "STALE_APPROVAL_BASELINE"
                : error instanceof ExpiredProposalError
                  ? "STALE_APPROVAL_EXPIRED"
                  : "WORKFLOW_FAILED",
            message: (error as Error).message,
            retryable: true,
          };
        },
      });
    } catch {
      // The original failure remains authoritative; avoid an unhandled rejection.
    }
  }

  private scheduleExpiry(workflow: Workflow): void {
    if (!workflow.grant || workflow.grant.status !== "active") return;
    const delay = new Date(workflow.grant.expiresAt).getTime() - Date.now();
    if (delay <= 0) {
      void this.autoExpire(workflow.id);
      return;
    }
    const existing = this.expiryTimers.get(workflow.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => void this.autoExpire(workflow.id), Math.min(delay, 2_147_000_000));
    timer.unref();
    this.expiryTimers.set(workflow.id, timer);
  }

  private async autoExpire(id: string): Promise<void> {
    try {
      const workflow = await this.getWorkflow(id);
      if (workflow.status !== "completed" || !workflow.grant || workflow.grant.status !== "active") return;
      await this.commit(id, {
        type: "expiry.reached",
        actor: "system",
        message: "The temporary release window expired; automatic recall started.",
        expectedStatuses: ["completed"],
        mutate: (draft) => {
          draft.status = "rolling_back";
        },
      });
      this.scheduleRollback(id, true);
    } catch {
      // Health/metrics surface the unchanged active workflow for operator recovery.
    }
  }

  private async resumeSafeJobs(): Promise<void> {
    const workflows = await this.store.listWorkflows();
    const now = Date.now();
    const finalByTarget = new Map<
      string,
      { subjectEmail: string; resourceId: string; grant: NonNullable<Workflow["grant"]> | null }
    >();
    const chronological = [...workflows].sort((a, b) => {
      const aTime = a.events.at(-1)?.timestamp ?? a.updatedAt;
      const bTime = b.events.at(-1)?.timestamp ?? b.updatedAt;
      return aTime.localeCompare(bTime);
    });
    for (const workflow of chronological) {
      const request = workflow.extractedRequest;
      if (!request) continue;
      const changesEffectiveState =
        workflow.status === "completed" ||
        workflow.status === "rolled_back" ||
        ((workflow.status === "rolling_back" ||
          workflow.status === "failed" ||
          workflow.status === "executing" ||
          workflow.status === "verifying") &&
          Boolean(workflow.grant));
      if (!changesEffectiveState) continue;

      const baseline = workflow.currentAccess.filter(
        (grant) => grant.status === "active" && new Date(grant.expiresAt).getTime() > now,
      );
      // Legacy append-only stores may contain multiple active snapshots. Never
      // recreate that unsafe union on boot; fail closed to no external share instead.
      const uniqueBaseline = baseline.length === 1 ? baseline[0]! : null;
      const completedGrant =
        workflow.status === "completed" &&
        workflow.grant?.status === "active" &&
        new Date(workflow.grant.expiresAt).getTime() > now
          ? workflow.grant
          : null;
      const desired = completedGrant ?? uniqueBaseline;
      const key = `${request.subjectEmail.toLowerCase()}\u0000${request.resourceId}`;
      finalByTarget.set(key, {
        subjectEmail: request.subjectEmail,
        resourceId: request.resourceId,
        grant: desired ? structuredClone(desired) : null,
      });
    }
    reconcileSandboxShareStates([...finalByTarget.values()]);

    for (const workflow of workflows) {
      if (workflow.status === "queued") this.schedulePreApproval(workflow.id);
      else if (workflow.status === "approved") this.scheduleExecution(workflow.id);
      else if (workflow.status === "completed") {
        if (workflow.grant && new Date(workflow.grant.expiresAt).getTime() <= Date.now()) {
          await this.finalizeExpiredRestart(workflow);
        } else {
          this.scheduleExpiry(workflow);
        }
      }
      else if (["extracting", "enriching_context", "evaluating_policy", "planning", "executing", "verifying", "rolling_back"].includes(workflow.status)) {
        await this.failWorkflow(workflow.id, new Error("Server restarted during an in-flight state; manual retry is required"));
      }
    }
  }

  private async finalizeExpiredRestart(workflow: Workflow): Promise<void> {
    if (!workflow.extractedRequest || !workflow.grant) return;
    const baseline = workflow.currentAccess.filter(
      (grant) => grant.status === "active" && new Date(grant.expiresAt).getTime() > Date.now(),
    );
    const expected =
      baseline.length === 1
        ? {
            grantId: baseline[0]!.grantId,
            role: baseline[0]!.role,
            actions: baseline[0]!.actions,
            expiresAt: baseline[0]!.expiresAt,
          }
        : null;
    const verification = await verifyShare({
      subjectEmail: workflow.extractedRequest.subjectEmail,
      resourceId: workflow.extractedRequest.resourceId,
      expected,
    });
    await this.commit(workflow.id, {
      type: "expiry.recovered_on_restart",
      actor: "system",
      message: verification.verified
        ? "The share expired while the service was offline; the reconciled baseline was verified."
        : "The share expired while offline, but baseline verification failed closed.",
      data: { grantId: workflow.grant.grantId, verified: verification.verified },
      expectedStatuses: ["completed"],
      mutate: (draft) => {
        if (draft.grant) {
          draft.grant.status = "revoked";
          draft.grant.revokedAt = new Date().toISOString();
        }
        draft.rollbackVerification = verification;
        draft.status = verification.verified ? "rolled_back" : "failed";
        if (!verification.verified) {
          draft.error = {
            code: "EXPIRY_RECOVERY_VERIFY_FAILED",
            message: verification.details,
            retryable: true,
          };
        }
      },
    });
  }

  private async pause(): Promise<void> {
    if (!this.stepDelayMs) return;
    await new Promise<void>((resolve) => setTimeout(resolve, this.stepDelayMs));
  }

  private qwenForWorkflow(scenarioId?: string): QwenClient {
    // Presets are reproducible recorded demonstrations even when the service is
    // configured for live Qwen. Custom requests always retain the configured
    // client, whose primary/fallback failures fail the workflow closed.
    return scenarioId
      ? new QwenClient("", { recordedDemoReason: "preset-workflow" })
      : this.qwen;
  }
}
