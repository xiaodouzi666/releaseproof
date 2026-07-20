export interface ReceiptFinding {
  id: string;
  title: string;
  detail: string;
  effect: string;
}

export interface MinimizationReceiptInput {
  requestedRole?: string;
  effectiveRole?: string;
  requestedActions: string[];
  effectiveActions: string[];
  requestedDurationHours?: number;
  maxDurationHours?: number;
  findings: ReceiptFinding[];
}

export interface MinimizationFieldOutcome {
  action: string;
  outcome: "retained" | "removed";
  reasonId: string;
  reason: string;
}

export interface MinimizationReceipt {
  requestedRole?: string;
  effectiveRole?: string;
  requestedDurationHours?: number;
  effectiveDurationHours?: number;
  fields: MinimizationFieldOutcome[];
  retainedCount: number;
  removedCount: number;
}

export interface RecallContractInput {
  recipient?: string;
  dataset?: string;
  expiresAt?: string;
  activeBaselineShares: number;
}

export interface RecallContract {
  target: string;
  trigger: string;
  baseline: string;
  successCondition: string;
  verification: string;
}

const REMOVAL_REASON_BY_ACTION: Readonly<Record<string, string>> = {
  "email.export": "fields.direct_identifiers_removed",
  "phone.export": "fields.direct_identifiers_removed",
  "raw.export": "fields.prohibited_exports_removed",
  "consent.override": "fields.prohibited_exports_removed",
};

const uniqueActions = (actions: string[]): string[] => [
  ...new Set(actions.map((action) => action.trim().toLowerCase()).filter(Boolean)),
];

const finiteHours = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;

function removalFinding(action: string, findings: ReceiptFinding[]): ReceiptFinding | undefined {
  const mappedId = REMOVAL_REASON_BY_ACTION[action];
  if (mappedId) {
    const mapped = findings.find((finding) => finding.id === mappedId);
    if (mapped) return mapped;
  }

  const normalizedAction = action.toLowerCase();
  return findings.find((finding) => {
    if (!["constrain", "deny", "warn", "block"].includes(finding.effect.toLowerCase())) return false;
    return `${finding.title} ${finding.detail}`.toLowerCase().includes(normalizedAction);
  });
}

/**
 * Produces a read-only UI receipt from the authoritative request and policy
 * response. It never decides policy or expands the effective manifest.
 */
export function buildMinimizationReceipt(input: MinimizationReceiptInput): MinimizationReceipt {
  const requestedActions = uniqueActions(input.requestedActions);
  const effectiveActions = new Set(uniqueActions(input.effectiveActions));
  const requestedDurationHours = finiteHours(input.requestedDurationHours);
  const maxDurationHours = finiteHours(input.maxDurationHours);
  const effectiveDurationHours = requestedDurationHours === undefined
    ? undefined
    : maxDurationHours === undefined
      ? requestedDurationHours
      : Math.min(requestedDurationHours, maxDurationHours);

  const fields = requestedActions.map<MinimizationFieldOutcome>((action) => {
    if (effectiveActions.has(action)) {
      return {
        action,
        outcome: "retained",
        reasonId: "manifest.effective_field",
        reason: "Retained in the deterministic effective manifest.",
      };
    }

    const finding = removalFinding(action, input.findings);
    return {
      action,
      outcome: "removed",
      reasonId: finding?.id ?? "manifest.fail_closed_omission",
      reason: finding?.detail ?? "Absent from the effective manifest; the release fails closed instead of inferring permission.",
    };
  });

  return {
    requestedRole: input.requestedRole,
    effectiveRole: input.effectiveRole,
    requestedDurationHours,
    effectiveDurationHours,
    fields,
    retainedCount: fields.filter((field) => field.outcome === "retained").length,
    removedCount: fields.filter((field) => field.outcome === "removed").length,
  };
}

export function buildRecallContract(input: RecallContractInput): RecallContract {
  const recipient = input.recipient?.trim() || "resolved recipient";
  const dataset = input.dataset?.trim() || "resolved dataset";
  const expiresAt = input.expiresAt?.trim();
  const baselineCount = Number.isFinite(input.activeBaselineShares)
    ? Math.max(0, Math.floor(input.activeBaselineShares))
    : 0;

  return {
    target: `${recipient} · ${dataset}`,
    trigger: expiresAt ? `Manual recall or TTL at ${expiresAt}` : "Manual recall or policy TTL",
    baseline: baselineCount === 0
      ? "No prior active share; recall returns the target to zero."
      : `${baselineCount} prior active ${baselineCount === 1 ? "share" : "shares"} restored from the reviewed baseline.`,
    successCondition: "0 active matching shares for this workflow-created release",
    verification: "Read after recall; success is reported only after observed state matches the baseline.",
  };
}
