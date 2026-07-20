import type { CSSProperties, ComponentType } from "react";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDownToLine,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  CircleMinus,
  CirclePlus,
  Clock3,
  Database,
  FileCheck2,
  Fingerprint,
  Gauge,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Radio,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TimerReset,
  UserCheck,
  UserRoundCheck,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { compactId, formatDateTime, formatDuration, formatStatus, relativeTime, sentenceCase } from "../format";
import type { PermissionChange, TimelineEvent, Workflow, WorkflowStatus } from "../types";

interface WorkflowDashboardProps {
  workflow: Workflow;
  streamState: "idle" | "connecting" | "live" | "polling";
  connectionError?: string;
  actionBusy?: "approve" | "reject" | "rollback";
  actionError?: string;
  onAction: (action: "approve" | "reject" | "rollback", detail?: { approver?: string; note?: string }) => void;
  onRefresh: () => void;
  onExport: () => void;
  onNewRequest: () => void;
}

type AnyRecord = Record<string, unknown>;

const asRecord = (value: unknown): AnyRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : {};

const asString = (value: unknown, fallback = "—") =>
  typeof value === "string" && value ? value : typeof value === "number" ? String(value) : fallback;

const statusOrder: WorkflowStatus[] = [
  "received",
  "analyzing",
  "planning",
  "awaiting_approval",
  "executing",
  "verifying",
  "completed",
];

const stages = [
  { label: "Intake", detail: "Captured", icon: FileCheck2 },
  { label: "Understand", detail: "Qwen extract", icon: Sparkles },
  { label: "Constrain", detail: "Policy engine", icon: Scale },
  { label: "Approve", detail: "Human gate", icon: UserCheck },
  { label: "Execute", detail: "Sandbox IAM", icon: KeyRound },
  { label: "Verify", detail: "Read after write", icon: Fingerprint },
  { label: "Expire", detail: "Auto-revoke", icon: TimerReset },
];

function currentStage(workflow: Workflow): number {
  const status = workflow.status;
  if (status === "approved") return 4;
  if (status === "completed") return 5;
  if (status === "rolling_back" || status === "rolled_back" || status === "revoked") return 6;
  if (status === "denied") return 2;
  if (status === "rejected") return 3;
  if (status === "failed") {
    const evidence = workflow.timeline.map((event) => `${event.type} ${event.tool ?? ""}`).join(" ").toLowerCase();
    if (evidence.includes("rollback") || evidence.includes("iam.revoke")) return 6;
    if (evidence.includes("verification") || evidence.includes("iam.verify")) return 5;
    if (evidence.includes("execution") || evidence.includes("iam.grant")) return 4;
    if (evidence.includes("policy") || evidence.includes("access.diff")) return 2;
    return 1;
  }
  const index = statusOrder.indexOf(status);
  return index < 0 ? 0 : index;
}

function WorkflowRail({ workflow }: { workflow: Workflow }) {
  const activeStage = currentStage(workflow);
  const terminalFailure = workflow.status === "failed" || workflow.status === "denied" || workflow.status === "rejected";
  const terminalSuccess = workflow.status === "completed" || workflow.status === "rolled_back" || workflow.status === "revoked";
  return (
    <div className="workflow-rail" aria-label={`Workflow progress: ${formatStatus(workflow.status)}`}>
      {stages.map((stage, index) => {
        const Icon = stage.icon;
        const complete = index < activeStage || (terminalSuccess && index === activeStage);
        const active = index === activeStage && !terminalSuccess;
        const failed = active && terminalFailure;
        return (
          <div
            key={stage.label}
            className={`rail-step ${complete ? "rail-step--complete" : ""} ${active ? "rail-step--active" : ""} ${failed ? "rail-step--failed" : ""}`}
          >
            <span className="rail-icon">{complete ? <Check size={15} /> : failed ? <X size={15} /> : <Icon size={16} />}</span>
            <span className="rail-copy"><strong>{stage.label}</strong><small>{stage.detail}</small></span>
          </div>
        );
      })}
    </div>
  );
}

function StreamBadge({ state }: { state: WorkflowDashboardProps["streamState"] }) {
  const content = {
    live: { label: "Live events", icon: Radio },
    polling: { label: "Polling fallback", icon: RefreshCw },
    connecting: { label: "Connecting", icon: LoaderCircle },
    idle: { label: "State settled", icon: CheckCircle2 },
  }[state];
  const Icon = content.icon;
  return (
    <span className={`stream-badge stream-badge--${state}`}>
      <Icon size={13} className={state === "connecting" ? "spin" : undefined} /> {content.label}
    </span>
  );
}

function SummaryCard({ workflow }: { workflow: Workflow }) {
  const raw = asRecord(workflow.raw);
  const extracted = asRecord(raw.extractedRequest);
  const directory = asRecord(raw.directoryUser);
  const resource = asRecord(raw.resource);
  const ticket = asRecord(raw.ticketEvidence);
  const request = workflow.extractedRequest;

  if (!request) {
    return (
      <section className="console-card summary-card" aria-labelledby="summary-title">
        <div className="card-heading">
          <div><span className="card-kicker">Normalized request</span><h3 id="summary-title">Extracting intent</h3></div>
          <LoaderCircle size={18} className="spin muted-icon" />
        </div>
        <div className="summary-skeleton">
          <span /><span /><span /><span />
        </div>
      </section>
    );
  }

  const confidenceValue = typeof extracted.confidence === "number" ? extracted.confidence : undefined;
  const confidence = confidenceValue === undefined ? undefined : Math.round(confidenceValue <= 1 ? confidenceValue * 100 : confidenceValue);
  return (
    <section className="console-card summary-card" aria-labelledby="summary-title">
      <div className="card-heading">
        <div><span className="card-kicker">Normalized request</span><h3 id="summary-title">Intent, not raw prose</h3></div>
        {confidence !== undefined ? <span className="confidence-badge">{confidence}% confidence</span> : null}
      </div>
      <div className="identity-line">
        <span className="identity-avatar"><UserRoundCheck size={19} /></span>
        <span>
          <strong>{asString(directory.displayName, request.requester)}</strong>
          <small>{asString(directory.department, request.requesterRole || "Identity directory match")}</small>
        </span>
        {directory.mfaEnrolled === true ? <span className="verified-chip"><ShieldCheck size={12} /> MFA</span> : null}
      </div>
      <dl className="request-facts">
        <div><dt>Subject</dt><dd>{asString(extracted.subjectEmail, request.requester)}</dd></div>
        <div><dt>Resource</dt><dd>{asString(resource.name, request.resource)}</dd></div>
        <div><dt>Requested role</dt><dd className="mono-value">{request.accessLevel}</dd></div>
        <div><dt>Time window</dt><dd>{request.duration}</dd></div>
        <div className="fact-wide"><dt>Business reason</dt><dd>{request.reason}</dd></div>
        {Object.keys(ticket).length ? (
          <div className="fact-wide">
            <dt>Ticket evidence</dt>
            <dd>
              <span className="mono-value">{asString(ticket.ticketId)}</span>
              {` · ${asString(ticket.title, "Reference located")} · ${sentenceCase(asString(ticket.status, "unknown"))} · reference only`}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="summary-foot">
        <span><Database size={13} /> {asString(resource.environment, request.environment || "Resource context pending")}</span>
        <span><FileCheck2 size={13} /> {asString(extracted.source, request.source || "text")}</span>
      </div>
    </section>
  );
}

function RiskCard({ workflow }: { workflow: Workflow }) {
  const risk = workflow.risk;
  if (!risk) {
    return (
      <section className="console-card risk-card" aria-labelledby="risk-title">
        <div className="card-heading"><div><span className="card-kicker">Risk posture</span><h3 id="risk-title">Evaluating controls</h3></div></div>
        <div className="risk-pending"><Gauge size={28} /><span>Deterministic checks are running.</span></div>
      </section>
    );
  }
  const style = { "--risk-angle": `${risk.score * 3.6}deg` } as CSSProperties;
  return (
    <section className={`console-card risk-card risk-card--${risk.level}`} aria-labelledby="risk-title">
      <div className="card-heading"><div><span className="card-kicker">Risk posture</span><h3 id="risk-title">{sentenceCase(risk.level)} risk</h3></div><ShieldAlert size={18} /></div>
      <div className="risk-body">
        <div className="risk-gauge" style={style} aria-label={`Risk score ${risk.score} out of 100`}>
          <div><strong>{risk.score}</strong><small>/ 100</small></div>
        </div>
        <div className="risk-copy">
          <strong>
            {workflow.status === "denied"
              ? "Policy blocks execution"
              : workflow.approval?.status === "approved"
                ? "Human approval recorded"
                : workflow.approval?.status === "rejected"
                  ? "Human reviewer rejected"
              : risk.level === "critical" || risk.level === "high"
                ? "Human decision required"
                : "Guardrails still apply"}
          </strong>
          <p>{risk.reasons[0] || "Risk score is derived from identity, resource, scope, and duration."}</p>
        </div>
      </div>
      {risk.reasons.length > 1 ? (
        <ul className="risk-reasons">
          {risk.reasons.slice(1, 4).map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

function TimelineIcon({ event }: { event: TimelineEvent }) {
  if (event.status === "failed") return <XCircle size={17} />;
  if (event.status === "active") return <LoaderCircle size={17} className="spin" />;
  if (event.status === "blocked") return <LockKeyhole size={17} />;
  if (event.tool || event.type.includes("tool")) return <Wrench size={16} />;
  if (event.actor?.toLowerCase().includes("qwen")) return <Bot size={17} />;
  return <Check size={16} />;
}

function AgentTimeline({ workflow }: { workflow: Workflow }) {
  const events = useMemo(() => {
    const unique = new Map<string, TimelineEvent>();
    workflow.timeline.forEach((event) => unique.set(event.id, event));
    return [...unique.values()];
  }, [workflow.timeline]);

  return (
    <section className="console-card timeline-card" aria-labelledby="timeline-title">
      <div className="card-heading card-heading--rule">
        <div><span className="card-kicker">Agent + tool trace</span><h3 id="timeline-title">What happened, in order</h3></div>
        <span className="event-count">{events.length} events</span>
      </div>
      {events.length ? (
        <ol className="agent-timeline">
          {events.map((event, index) => {
            const auditHash = asString(event.details?.hash, "");
            const previousHash = event.details?.previousHash === null
              ? "GENESIS"
              : asString(event.details?.previousHash, "");
            const auditSequence = event.details?.sequence;
            return (
            <li className={`timeline-event timeline-event--${event.status}`} key={event.id}>
              <span className="timeline-marker"><TimelineIcon event={event} /></span>
              <div className="timeline-content">
                <div className="timeline-title-row">
                  <strong>{event.title}</strong>
                  <time dateTime={event.timestamp}>{relativeTime(event.timestamp)}</time>
                </div>
                {event.message ? <p>{event.message}</p> : null}
                <div className="timeline-meta">
                  {event.actor ? <span>{event.actor}</span> : null}
                  {event.tool ? <code>{event.tool}</code> : null}
                  {event.durationMs !== undefined ? <span>{formatDuration(event.durationMs)}</span> : null}
                  <span className="sequence-chip">#{String(index + 1).padStart(2, "0")}</span>
                </div>
                {auditHash ? (
                  <details className="timeline-audit-proof">
                    <summary>Audit proof</summary>
                    <dl>
                      <div><dt>Sequence</dt><dd>{asString(auditSequence, String(index + 1))}</dd></div>
                      <div><dt>Previous</dt><dd><code>{previousHash || "Unavailable"}</code></dd></div>
                      <div><dt>Event hash</dt><dd><code>{auditHash}</code></dd></div>
                    </dl>
                  </details>
                ) : null}
              </div>
            </li>
            );
          })}
        </ol>
      ) : (
        <div className="timeline-empty">
          <Activity size={25} />
          <strong>Waiting for the first trace</strong>
          <span>Agent steps and deterministic tool calls appear here.</span>
        </div>
      )}
    </section>
  );
}

function DiffIcon({ action }: { action: PermissionChange["action"] }) {
  if (action === "add") return <CirclePlus size={16} />;
  if (action === "remove" || action === "deny") return <CircleMinus size={16} />;
  return <CheckCircle2 size={16} />;
}

function PermissionDiffCard({ workflow }: { workflow: Workflow }) {
  const raw = asRecord(workflow.raw);
  const rawDiff = asRecord(raw.diff);
  const before = asRecord(rawDiff.before);
  const after = asRecord(rawDiff.after);
  const changes = workflow.permissionDiff;
  return (
    <section className="console-card diff-card" aria-labelledby="diff-title">
      <div className="card-heading card-heading--rule">
        <div><span className="card-kicker">Least-privilege compiler</span><h3 id="diff-title">Permission diff</h3></div>
        {changes.length ? <span className="diff-count">{changes.filter((item) => item.action === "add").length} add · {changes.filter((item) => item.action === "remove").length} remove</span> : null}
      </div>
      {Object.keys(rawDiff).length ? (
        <div className="diff-overview">
          <div><span>Before</span><strong>{asString(before.role, "No access")}</strong></div>
          <ChevronRight size={18} />
          <div><span>Proposed</span><strong>{asString(after.role, "Pending")}</strong></div>
        </div>
      ) : null}
      {changes.length ? (
        <ul className="diff-list">
          {changes.map((change) => (
            <li className={`diff-item diff-item--${change.action}`} key={change.id}>
              <span className="diff-symbol"><DiffIcon action={change.action} /></span>
              <span className="diff-copy">
                <strong>{change.permission}</strong>
                <small>{change.scope || change.reason || (change.action === "keep" ? "Already satisfied" : "Minimum required scope")}</small>
              </span>
              <span className="diff-action">{change.action}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card-empty"><CircleDashed size={22} /><span>The minimal change set appears after policy evaluation.</span></div>
      )}
      {asString(rawDiff.summary, "") ? <p className="diff-summary">{asString(rawDiff.summary)}</p> : null}
    </section>
  );
}

function PolicyCard({ workflow }: { workflow: Workflow }) {
  const raw = asRecord(workflow.raw);
  const decision = asRecord(raw.decision);
  const policyVersion = asString(decision.policyVersion, "Control set pending");
  return (
    <section className="console-card policy-card" aria-labelledby="policy-title">
      <div className="card-heading card-heading--rule">
        <div><span className="card-kicker">Deterministic evidence</span><h3 id="policy-title">Policy findings</h3></div>
        <code className="policy-version">{policyVersion}</code>
      </div>
      {workflow.policyEvidence.length ? (
        <ul className="policy-list">
          {workflow.policyEvidence.map((evidence) => (
            <li key={evidence.id} className={`policy-finding policy-finding--${evidence.verdict}`}>
              <span className="finding-icon">
                {evidence.verdict === "pass" ? <CheckCircle2 size={16} /> : evidence.verdict === "block" ? <AlertOctagon size={16} /> : <AlertTriangle size={16} />}
              </span>
              <span><strong>{evidence.policy}</strong><small>{evidence.explanation || "Policy evidence recorded."}</small></span>
              <em>{evidence.verdict}</em>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card-empty"><Scale size={22} /><span>Policy evidence is being assembled.</span></div>
      )}
      <div className="policy-authority"><LockKeyhole size={14} /> Application policy has final authority. Model output cannot bypass a deny.</div>
    </section>
  );
}

function ApprovalGate({ workflow, busy, error, onAction }: Pick<WorkflowDashboardProps, "workflow" | "actionBusy" | "actionError" | "onAction"> & { busy?: WorkflowDashboardProps["actionBusy"]; error?: string }) {
  const [approver, setApprover] = useState("Security reviewer");
  const [note, setNote] = useState("");
  const rawStatus = asString(asRecord(workflow.raw).status, workflow.status).toLowerCase();
  const waiting = workflow.status === "awaiting_approval";
  const policyDenied = workflow.status === "denied" || rawStatus === "denied";

  const heading = waiting
    ? "A human owns this decision"
    : policyDenied
      ? "Policy denied this request"
      : workflow.status === "rejected"
        ? "Reviewer rejected this request"
        : workflow.approval?.status === "approved" || ["approved", "executing", "verifying", "completed"].includes(workflow.status)
          ? "Human approval recorded"
          : "Approval gate is locked";

  return (
    <section className={`console-card approval-card ${waiting ? "approval-card--waiting" : ""}`} aria-labelledby="approval-title">
      <div className="approval-beacon"><UserCheck size={21} /></div>
      <span className="card-kicker">Human-in-the-loop gate</span>
      <h3 id="approval-title">{heading}</h3>
      <p>
        {waiting
          ? "Review the normalized request, policy findings, and exact permission diff. No write occurs until you decide."
          : policyDenied
            ? "A hard policy constraint stopped execution. Human approval cannot override a deterministic deny."
            : workflow.approval?.note || "The control plane will stop here until analysis reaches a reviewable decision."}
      </p>

      {waiting ? (
        <div className="approval-form">
          <label htmlFor="approver-name">Reviewer</label>
          <input id="approver-name" value={approver} onChange={(event) => setApprover(event.target.value)} maxLength={100} />
          <label htmlFor="approval-note">Decision note <span>optional</span></label>
          <textarea id="approval-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} placeholder="Why is this time-bound access appropriate?" />
          {error ? <div className="compact-error" role="alert"><AlertTriangle size={14} /> {error}</div> : null}
          <div className="approval-actions">
            <button type="button" className="button button--danger" data-testid="reject-workflow" disabled={Boolean(busy)} onClick={() => onAction("reject", { approver: approver.trim() || undefined, note: note.trim() || undefined })}>
              {busy === "reject" ? <LoaderCircle className="spin" size={17} /> : <X size={17} />} Reject
            </button>
            <button type="button" className="button button--approve" data-testid="approve-workflow" disabled={Boolean(busy)} onClick={() => onAction("approve", { approver: approver.trim() || undefined, note: note.trim() || undefined })}>
              {busy === "approve" ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />} Approve temporary grant
            </button>
          </div>
        </div>
      ) : (
        <div className="gate-status">
          {policyDenied || workflow.status === "rejected" ? <XCircle size={17} /> : workflow.approval?.status === "approved" ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}
          <span>
            <strong>{workflow.approval?.decidedBy || (policyDenied ? "Deterministic policy engine" : "Waiting on upstream steps")}</strong>
            <small>{workflow.approval?.decidedAt ? formatDateTime(workflow.approval.decidedAt) : formatStatus(workflow.status)}</small>
          </span>
        </div>
      )}
    </section>
  );
}

interface AuditState {
  label: string;
  detail: string;
  state: "pending" | "active" | "done" | "failed";
  icon: ComponentType<{ size?: number; className?: string }>;
}

function ExecutionAudit({ workflow, busy, onRollback }: { workflow: Workflow; busy?: string; onRollback: () => void }) {
  const raw = asRecord(workflow.raw);
  const grant = asRecord(raw.grant);
  const verification = asRecord(raw.verification);
  const rollbackVerification = asRecord(raw.rollbackVerification);
  const hasGrant = Object.keys(grant).length > 0;
  const verified = verification.verified === true || workflow.execution?.verified === true;
  const expiresAt = workflow.execution?.expiresAt || asString(grant.expiresAt, "");
  const rollingBack = workflow.status === "rolling_back";
  const rolledBack = workflow.status === "rolled_back" || rollbackVerification.verified === true;

  const states: AuditState[] = [
    {
      label: "Temporary grant",
      detail: hasGrant ? `${asString(grant.role, "Scoped role")} · ${compactId(asString(grant.grantId, "grant"))}` : "Not executed",
      state: hasGrant ? "done" : workflow.status === "executing" ? "active" : "pending",
      icon: KeyRound,
    },
    {
      label: "Read-after-write",
      detail: verified ? asString(verification.details, "Observed access matches proposal") : "Verification pending",
      state: verified ? "done" : workflow.status === "verifying" ? "active" : "pending",
      icon: Fingerprint,
    },
    {
      label: "Automatic revocation",
      detail: rolledBack
        ? "Revocation observed and verified"
        : rollingBack
          ? "Revoking and reading state back"
          : expiresAt
            ? `Scheduled ${formatDateTime(expiresAt)}`
            : "Scheduled after grant",
      state: rolledBack ? "done" : rollingBack ? "active" : "pending",
      icon: TimerReset,
    },
    {
      label: "Rollback path",
      detail: rolledBack ? "Revocation verified" : rollingBack ? "Revoking and verifying" : hasGrant ? "Ready if conditions change" : "Available after execution",
      state: rolledBack ? "done" : rollingBack ? "active" : "pending",
      icon: RotateCcw,
    },
  ];

  const canRollback = hasGrant && !rolledBack && workflow.status !== "rolling_back" && asString(grant.status, "active") !== "revoked";
  return (
    <section className="console-card audit-card" aria-labelledby="audit-title">
      <div className="card-heading card-heading--rule">
        <div><span className="card-kicker">Execution assurance</span><h3 id="audit-title">Grant lifecycle</h3></div>
        <span className="tamper-chip"><Fingerprint size={13} /> hash-linked audit</span>
      </div>
      <div className="audit-state-grid">
        {states.map((item) => {
          const Icon = item.icon;
          return (
            <div className={`audit-state audit-state--${item.state}`} key={item.label}>
              <span className="audit-state-icon">{item.state === "done" ? <Check size={16} /> : item.state === "active" ? <LoaderCircle size={16} className="spin" /> : <Icon size={16} />}</span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </div>
          );
        })}
      </div>
      {canRollback || rollingBack ? (
        <div className="rollback-row">
          <span><AlertTriangle size={15} /> Emergency path is idempotent and verified.</span>
          <button type="button" className="button button--secondary" data-testid="rollback-workflow" disabled={rollingBack || Boolean(busy)} onClick={onRollback}>
            {rollingBack || busy === "rollback" ? <LoaderCircle size={16} className="spin" /> : <RotateCcw size={16} />} Roll back grant
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ModelReceipt({ workflow }: { workflow: Workflow }) {
  const metadata = workflow.metadata;
  const recorded = metadata.providerMode?.toLowerCase().includes("recorded");
  const liveCompleted = !recorded && (metadata.calls ?? 0) > 0;
  return (
    <section className="model-receipt" aria-label="Model execution metadata">
      <div className="receipt-title"><Bot size={16} /><strong>Model receipt</strong></div>
      <div className="receipt-items">
        <span><small>Mode</small><strong className={recorded ? "text-amber" : ""}>{recorded ? "Recorded Demo" : liveCompleted ? "Live Qwen completed" : "Qwen configured"}</strong></span>
        <span><small>Model</small><strong>{metadata.model || "Not reported"}</strong></span>
        <span><small>Latency</small><strong>{formatDuration(metadata.latencyMs)}</strong></span>
        <span><small>Calls</small><strong>{metadata.calls ?? "—"}</strong></span>
        <span><small>Tokens in → out</small><strong>{metadata.inputTokens !== undefined || metadata.outputTokens !== undefined ? `${metadata.inputTokens || 0} → ${metadata.outputTokens || 0}` : "—"}</strong></span>
      </div>
      {metadata.fallbackUsed ? <div className="fallback-note"><AlertTriangle size={13} /> Fallback model used and disclosed by backend.</div> : null}
      {metadata.disclosure ? <p className="receipt-disclosure">{metadata.disclosure}</p> : null}
    </section>
  );
}

export function WorkflowDashboard({
  workflow,
  streamState,
  connectionError,
  actionBusy,
  actionError,
  onAction,
  onRefresh,
  onExport,
  onNewRequest,
}: WorkflowDashboardProps) {
  return (
    <section className="workflow-section" aria-labelledby="workflow-heading">
      <div className="workflow-header">
        <div>
          <span className="eyebrow"><Activity size={14} /> Active control run</span>
          <h2 id="workflow-heading">{formatStatus(workflow.status)}</h2>
          <div className="workflow-id-row">
            <code>{compactId(workflow.id)}</code>
            <span>Updated {relativeTime(workflow.updatedAt)}</span>
            <StreamBadge state={streamState} />
          </div>
        </div>
        <div className="workflow-header-actions">
          <button className="icon-text-button" type="button" onClick={onRefresh} aria-label="Refresh workflow"><RefreshCw size={16} /> Refresh</button>
          <button className="icon-text-button" type="button" onClick={onExport}><ArrowDownToLine size={16} /> Export JSON</button>
          <button className="button button--secondary" type="button" onClick={onNewRequest}>New request</button>
        </div>
      </div>

      {connectionError ? <div className="connection-notice"><AlertTriangle size={15} /> {connectionError}. The control room will keep reconciling state.</div> : null}
      {actionError ? <div className="connection-notice" role="alert"><AlertTriangle size={15} /> {actionError}</div> : null}
      {workflow.error ? (
        <div className="workflow-failure-notice" role="alert">
          <AlertOctagon size={17} />
          <div>
            <strong>{workflow.error.code}</strong>
            <span>{workflow.error.message}</span>
            <small>{workflow.error.retryable ? "Retry is allowed after the underlying condition is corrected." : "This failure is terminal for the current workflow."}</small>
          </div>
        </div>
      ) : null}
      <WorkflowRail workflow={workflow} />

      <div className="console-grid console-grid--top">
        <SummaryCard workflow={workflow} />
        <RiskCard workflow={workflow} />
      </div>

      <div className="console-grid console-grid--main">
        <AgentTimeline workflow={workflow} />
        <div className="console-side-stack">
          <ApprovalGate workflow={workflow} busy={actionBusy} onAction={onAction} />
          <PermissionDiffCard workflow={workflow} />
        </div>
      </div>

      <div className="console-grid console-grid--evidence">
        <PolicyCard workflow={workflow} />
        <ExecutionAudit workflow={workflow} busy={actionBusy} onRollback={() => onAction("rollback", { approver: "Security reviewer", note: "Emergency rollback from GrantGuard control room" })} />
      </div>

      <ModelReceipt workflow={workflow} />
    </section>
  );
}
