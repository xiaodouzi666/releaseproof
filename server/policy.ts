import type {
  AccessGrant,
  DecisionOutcome,
  DirectoryUser,
  ExtractedAccessRequest,
  PolicyDecision,
  PolicyFinding,
  ResourceProfile,
  RiskLevel,
  TicketEvidence,
} from "../shared/contracts.js";

export const POLICY_VERSION = "releaseproof-policy-2026.07.1";

// The stable internal tier values keep the workflow/store compatible. Publicly
// they mean aggregate, profile, contact-export, and raw release respectively.
const ROLE_ACTIONS: Record<ExtractedAccessRequest["requestedRole"], string[]> = {
  viewer: ["aggregate.read"],
  contributor: ["aggregate.read", "profile.read"],
  operator: ["aggregate.read", "profile.read", "email.export", "phone.export"],
  admin: [
    "aggregate.read",
    "profile.read",
    "email.export",
    "phone.export",
    "raw.export",
    "consent.override",
  ],
};

const ROLE_RANK: Record<ExtractedAccessRequest["requestedRole"], number> = {
  viewer: 0,
  contributor: 1,
  operator: 2,
  admin: 3,
};

const ACTION_ROLE: Record<string, ExtractedAccessRequest["requestedRole"]> = {
  "aggregate.read": "viewer",
  "profile.read": "contributor",
  "email.export": "operator",
  "phone.export": "operator",
  "raw.export": "admin",
  "consent.override": "admin",
};

const DIRECT_IDENTIFIER_ACTIONS = new Set(["email.export", "phone.export"]);
const PROHIBITED_ACTIONS = new Set(["raw.export", "consent.override"]);

function finding(
  id: string,
  severity: RiskLevel,
  title: string,
  detail: string,
  effect: PolicyFinding["effect"],
): PolicyFinding {
  return { id, severity, title, detail, effect };
}

function normalizeActions(request: ExtractedAccessRequest): { actions: string[]; invalid: string[] } {
  const normalized = request.requestedActions.map((action) => action.toLowerCase().trim());
  return {
    actions: [...new Set(normalized.filter((action) => action in ACTION_ROLE))],
    invalid: normalized.filter((action) => !action || !(action in ACTION_ROLE)),
  };
}

function minimumRoleForActions(actions: string[]): ExtractedAccessRequest["requestedRole"] {
  let role: ExtractedAccessRequest["requestedRole"] = "viewer";
  for (const action of actions) {
    const required = ACTION_ROLE[action] ?? "admin";
    if (ROLE_RANK[required] > ROLE_RANK[role]) role = required;
  }
  return role;
}

function riskFromScore(score: number): RiskLevel {
  if (score >= 85) return "critical";
  if (score >= 55) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export interface PolicyInput {
  request: ExtractedAccessRequest;
  user: DirectoryUser | null;
  resource: ResourceProfile | null;
  agreement?: TicketEvidence | null;
  currentAccess: AccessGrant[];
}

/**
 * Deterministic, fail-closed external-release policy. Qwen output and agreement
 * text are evidence, never authority. Only code can reduce or reject fields.
 */
export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const { request, user: recipient, resource: dataset, agreement, currentAccess } = input;
  const findings: PolicyFinding[] = [];
  let score = 5;
  let denied = false;
  const normalizedActions = normalizeActions(request);
  let actions = normalizedActions.actions;

  if (request.requestedActions.length === 0 || normalizedActions.invalid.length > 0) {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "request.fields_invalid",
        "critical",
        "Invalid release scope",
        normalizedActions.invalid.length
          ? `Unknown or empty field actions are not releasable: ${normalizedActions.invalid.map((action) => action || "<empty>").join(", ")}.`
          : "At least one explicit allowlisted field action is required; a release tier never expands into unnamed fields.",
        "deny",
      ),
    );
    actions = [];
  }

  const initiallyRequiredRole = actions.length ? minimumRoleForActions(actions) : request.requestedRole;
  if (ROLE_RANK[initiallyRequiredRole] > ROLE_RANK[request.requestedRole]) {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "release.fields_exceed_requested_tier",
        "critical",
        "Fields exceed requested tier",
        `The named fields require ${initiallyRequiredRole}, broader than the explicitly requested ${request.requestedRole} tier. ReleaseProof will not infer a broader release.`,
        "deny",
      ),
    );
    actions = [];
  }

  if (!recipient || !recipient.active) {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "recipient.inactive_or_unknown",
        "critical",
        "Recipient is not eligible",
        "The external recipient is absent from the vendor registry or inactive. ReleaseProof fails closed.",
        "deny",
      ),
    );
  } else if (!recipient.verified) {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "recipient.unverified",
        "critical",
        "Vendor is not verified",
        "Vendor verification must be complete before any data field, including aggregates, can be shared.",
        "deny",
      ),
    );
  }

  if (!dataset) {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "dataset.unknown",
        "critical",
        "Unknown dataset",
        "The requested dataset is not in the governed data catalog.",
        "deny",
      ),
    );
  }

  if (recipient && request.subjectEmail.toLowerCase() !== recipient.email.toLowerCase()) {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "recipient.mismatch",
        "critical",
        "Recipient mismatch",
        "The extracted recipient does not match the resolved vendor-registry entry.",
        "deny",
      ),
    );
  }

  if (dataset?.classification === "restricted") {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "dataset.restricted_external_release",
        "critical",
        "Restricted dataset cannot leave the boundary",
        "This prototype never releases restricted datasets externally, even when a recipient and agreement are valid.",
        "deny",
      ),
    );
  } else if (dataset?.classification === "confidential") {
    score += 25;
    findings.push(
      finding(
        "dataset.confidential",
        "high",
        "Confidential dataset",
        "Only minimized fields may be released, with an active agreement, a short expiry, and named human approval.",
        "constrain",
      ),
    );
  }

  if (dataset?.containsDirectIdentifiers) {
    score += 15;
    findings.push(
      finding(
        "dataset.direct_identifiers_present",
        "high",
        "Direct identifiers present",
        "The source contains direct identifiers, so the release envelope is minimized before approval.",
        "constrain",
      ),
    );
  }

  if (recipient?.agreementRequired) {
    if (!request.ticketId || !agreement) {
      denied = true;
      score = 100;
      findings.push(
        finding(
          "agreement.missing",
          "critical",
          "Active agreement required",
          "The recipient requires a registered agreement, and no matching agreement record was resolved.",
          "deny",
        ),
      );
    } else if (agreement.status !== "active") {
      denied = true;
      score = 100;
      findings.push(
        finding(
          "agreement.inactive",
          "critical",
          "Agreement is not active",
          `Agreement ${agreement.ticketId} is ${agreement.status}; draft or expired agreements cannot authorize a release.`,
          "deny",
        ),
      );
    } else if (agreement.recipientEmail.toLowerCase() !== request.subjectEmail.toLowerCase()) {
      denied = true;
      score = 100;
      findings.push(
        finding(
          "agreement.recipient_mismatch",
          "critical",
          "Agreement belongs to another recipient",
          "Agreement evidence is reference-only and cannot be transferred to a different vendor identity.",
          "deny",
        ),
      );
    }
  }

  if (request.justification.trim().length < 12) {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "request.purpose_missing",
        "critical",
        "Specific purpose required",
        "A concrete external-use purpose is required before any field-level release can be proposed.",
        "deny",
      ),
    );
  }

  if (request.requestedRole === "admin") {
    score += 30;
    findings.push(
      finding(
        "release.raw_tier_requested",
        "critical",
        "Raw release tier requested",
        "Raw or consent-override requests receive maximum scrutiny and are reduced to safe, named fields when possible.",
        "constrain",
      ),
    );
  }

  const directIdentifiers = actions.filter((action) => DIRECT_IDENTIFIER_ACTIONS.has(action));
  if (directIdentifiers.length) {
    actions = actions.filter((action) => !DIRECT_IDENTIFIER_ACTIONS.has(action));
    score += 20;
    findings.push(
      finding(
        "fields.direct_identifiers_removed",
        "critical",
        "Direct identifiers removed",
        `Field minimization removed ${directIdentifiers.join(", ")}; this release sandbox never exports direct contact identifiers.`,
        "constrain",
      ),
    );
  }

  const prohibited = actions.filter((action) => PROHIBITED_ACTIONS.has(action));
  if (prohibited.length) {
    actions = actions.filter((action) => !PROHIBITED_ACTIONS.has(action));
    score += 25;
    findings.push(
      finding(
        "fields.prohibited_exports_removed",
        "critical",
        "Raw and consent-bypass actions removed",
        `ReleaseProof removed ${prohibited.join(", ")}; an agreement-shaped reference never permits raw export or consent override.`,
        "constrain",
      ),
    );
  }

  if (!denied && actions.length === 0) {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "fields.no_safe_scope_remaining",
        "critical",
        "No releasable fields remain",
        "Every requested field action is prohibited, so the request is denied before approval or sharing.",
        "deny",
      ),
    );
  }

  let effectiveRole = actions.length ? minimumRoleForActions(actions) : request.requestedRole;
  if (ROLE_RANK[effectiveRole] < ROLE_RANK[request.requestedRole]) {
    score += 15;
    findings.push(
      finding(
        "minimization.tier_reduced",
        "high",
        "Release tier reduced",
        `The requested ${request.requestedRole} tier was reduced to ${effectiveRole}, the minimum tier for the remaining fields.`,
        "constrain",
      ),
    );
  }

  if (dataset && !dataset.allowedRoles.includes(effectiveRole)) {
    const allowed = [...dataset.allowedRoles].sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);
    const requiredRank = ROLE_RANK[actions.length ? minimumRoleForActions(actions) : request.requestedRole];
    const compatible = allowed.find(
      (role) => ROLE_RANK[role] >= requiredRank && ROLE_RANK[role] <= ROLE_RANK[request.requestedRole],
    );
    if (!compatible) {
      denied = true;
      score = 100;
      findings.push(
        finding(
          "dataset.tier_not_allowed",
          "critical",
          "Release tier not allowed for dataset",
          "The data catalog cannot satisfy the requested fields within an allowed release tier.",
          "deny",
        ),
      );
    } else {
      effectiveRole = compatible;
    }
  }

  const alreadyHasEquivalent = currentAccess.some(
    (grant) =>
      grant.status === "active" &&
      ROLE_RANK[grant.role] >= ROLE_RANK[effectiveRole] &&
      actions.every((action) => grant.actions.includes(action)),
  );
  if (alreadyHasEquivalent) {
    findings.push(
      finding(
        "share.duplicate_avoided",
        "low",
        "Existing share detected",
        "The exact release envelope is already active; execution will verify it instead of creating a duplicate share.",
        "permit",
      ),
    );
  }

  const maxDurationHours = dataset?.classification === "confidential" ? 8 : 24;
  if (request.durationHours > maxDurationHours) {
    score += 10;
    findings.push(
      finding(
        "expiry.duration_reduced",
        "medium",
        "Release window reduced",
        `The requested window was capped at ${maxDurationHours} hours and will be recalled automatically.`,
        "constrain",
      ),
    );
  }

  const risk = riskFromScore(Math.min(100, score));
  const outcome: DecisionOutcome = denied ? "deny" : "requires_approval";
  if (!denied) {
    findings.push(
      finding(
        "approval.human_gate",
        risk,
        "Human release approval required",
        "ReleaseProof never creates an external share without a named human approving the exact recipient, dataset, fields, and expiry.",
        "constrain",
      ),
    );
  }

  return {
    outcome,
    risk,
    score: Math.min(100, score),
    requestedRole: request.requestedRole,
    effectiveRole,
    effectiveActions: denied ? [] : actions.filter((action) => ROLE_ACTIONS[effectiveRole].includes(action)),
    maxDurationHours,
    requiresHumanApproval: !denied,
    findings,
    policyVersion: POLICY_VERSION,
  };
}

export function roleRank(role: ExtractedAccessRequest["requestedRole"]): number {
  return ROLE_RANK[role];
}
