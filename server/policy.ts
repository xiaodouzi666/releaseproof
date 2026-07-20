import type {
  AccessGrant,
  DecisionOutcome,
  DirectoryUser,
  ExtractedAccessRequest,
  PolicyDecision,
  PolicyFinding,
  ResourceProfile,
  RiskLevel,
} from "../shared/contracts.js";

export const POLICY_VERSION = "grantguard-policy-2026.07.3";

const ROLE_ACTIONS: Record<ExtractedAccessRequest["requestedRole"], string[]> = {
  viewer: ["read", "list"],
  contributor: ["read", "list", "write", "deploy"],
  operator: ["read", "list", "logs", "deploy", "restart"],
  admin: ["read", "list", "logs", "write", "deploy", "restart", "iam.manage", "delete"],
};

const ROLE_RANK: Record<ExtractedAccessRequest["requestedRole"], number> = {
  viewer: 0,
  contributor: 1,
  operator: 2,
  admin: 3,
};

const ACTION_ROLE: Record<string, ExtractedAccessRequest["requestedRole"]> = {
  read: "viewer",
  list: "viewer",
  logs: "operator",
  write: "contributor",
  deploy: "contributor",
  restart: "operator",
  "iam.manage": "admin",
  delete: "admin",
};

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
  currentAccess: AccessGrant[];
}

/**
 * Deterministic, fail-closed authorization policy. Model output is treated as
 * untrusted input and can never override these rules.
 */
export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const { request, user, resource, currentAccess } = input;
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
        "request.actions_invalid",
        "critical",
        "Invalid action scope",
        normalizedActions.invalid.length
          ? `Unknown or empty actions are not permitted: ${normalizedActions.invalid.map((action) => action || "<empty>").join(", ")}.`
          : "At least one explicit allowlisted action is required; role defaults are never expanded implicitly.",
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
        "privilege.actions_exceed_requested_role",
        "critical",
        "Actions exceed requested role",
        `The named actions require ${initiallyRequiredRole}, which is broader than the explicitly requested ${request.requestedRole} role. GrantGuard will not infer a role escalation.`,
        "deny",
      ),
    );
    actions = [];
  }

  if (!user || !user.active) {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "identity.inactive_or_unknown",
        "critical",
        "Identity is not eligible",
        "The subject is absent from the directory or is inactive. Policy fails closed.",
        "deny",
      ),
    );
  }

  if (!resource) {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "resource.unknown",
        "critical",
        "Unknown resource",
        "The requested resource is not in the governed resource catalog.",
        "deny",
      ),
    );
  }

  if (user && request.subjectEmail.toLowerCase() !== user.email.toLowerCase()) {
    denied = true;
    score = 100;
    findings.push(
      finding(
        "identity.subject_mismatch",
        "critical",
        "Subject mismatch",
        "The extracted subject does not match the resolved directory identity.",
        "deny",
      ),
    );
  }

  if (resource?.environment === "production") {
    score += 35;
    findings.push(
      finding(
        "environment.production",
        "high",
        "Production resource",
        "Production changes require an explicit human approval and a short expiry.",
        "constrain",
      ),
    );
    if (user && !user.mfaEnrolled) {
      denied = true;
      score = 100;
      findings.push(
        finding("identity.mfa_required", "critical", "MFA required", "Production access requires enrolled MFA.", "deny"),
      );
    }
  }

  if (resource?.classification === "restricted") {
    score += 45;
    if (user?.clearance !== "restricted") {
      denied = true;
      score = 100;
      findings.push(
        finding(
          "clearance.insufficient",
          "critical",
          "Insufficient clearance",
          "Restricted data may only be accessed by identities with restricted clearance.",
          "deny",
        ),
      );
    }
  } else if (resource?.classification === "confidential") {
    score += 25;
    findings.push(
      finding(
        "data.confidential",
        "high",
        "Confidential data",
        "Access is time boxed and recorded for the resource owner.",
        "constrain",
      ),
    );
  }

  if (user?.employmentType === "contractor") {
    score += 20;
    if (resource?.environment === "production" && ROLE_RANK[request.requestedRole] >= ROLE_RANK.operator) {
      denied = true;
      score = 100;
      findings.push(
        finding(
          "contractor.production_privileged",
          "critical",
          "Privileged contractor access blocked",
          "Contractors cannot receive operator or administrator roles in production.",
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
        "request.justification_missing",
        "critical",
        "Insufficient justification",
        "A specific business or incident justification is required.",
        "deny",
      ),
    );
  }

  if (request.requestedRole === "admin") {
    score += 30;
    findings.push(
      finding(
        "privilege.admin_requested",
        "critical",
        "Administrator role requested",
        "Administrator requests receive the highest scrutiny even when least-privilege reduction is possible.",
        "constrain",
      ),
    );
  }

  if (resource?.environment === "production" && !request.ticketId) {
    score += 20;
    findings.push(
      finding(
        "request.ticket_missing",
        "high",
        "No change ticket detected",
        "Approval should confirm an accountable ticket before execution.",
        "constrain",
      ),
    );
  }

  const dangerous: string[] = actions.filter((action) => action === "iam.manage" || action === "delete");
  if (dangerous.length) {
    actions = actions.filter((action) => !dangerous.includes(action));
    score += 25;
    findings.push(
      finding(
        "privilege.dangerous_actions_removed",
        "critical",
        "Dangerous actions removed",
        "This prototype never grants IAM-management or delete scope; a ticket-shaped reference is not authoritative proof.",
        "constrain",
      ),
    );

    if (actions.length === 0) {
      denied = true;
      score = 100;
      findings.push(
        finding(
          "privilege.no_safe_actions_remaining",
          "critical",
          "No grantable actions remain",
          "Every requested action is outside GrantGuard's grantable scope, so the request is denied before approval or execution.",
          "deny",
        ),
      );
    }
  }

  let effectiveRole = actions.length ? minimumRoleForActions(actions) : request.requestedRole;
  if (ROLE_RANK[effectiveRole] < ROLE_RANK[request.requestedRole]) {
    score += 15;
    findings.push(
      finding(
        "least_privilege.role_reduced",
        "high",
        "Role reduced to minimum",
        `The requested admin role was reduced to ${effectiveRole}, which is sufficient for the named actions.`,
        "constrain",
      ),
    );
  }

  if (resource && !resource.allowedRoles.includes(effectiveRole)) {
    const allowed = [...resource.allowedRoles].sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);
    const requiredRank = ROLE_RANK[actions.length ? minimumRoleForActions(actions) : request.requestedRole];
    const compatible = allowed.find(
      (role) => ROLE_RANK[role] >= requiredRank && ROLE_RANK[role] <= ROLE_RANK[request.requestedRole],
    );
    if (!compatible) {
      denied = true;
      score = 100;
      findings.push(
        finding(
          "resource.role_not_allowed",
          "critical",
          "Role not permitted on resource",
          "The resource catalog cannot satisfy the requested actions with an allowed role.",
          "deny",
        ),
      );
    } else {
      effectiveRole = compatible;
    }
  }

  const alreadyHasEquivalent = currentAccess.some(
    (grant) => grant.status === "active" && ROLE_RANK[grant.role] >= ROLE_RANK[effectiveRole],
  );
  if (alreadyHasEquivalent) {
    findings.push(
      finding(
        "access.duplicate_avoided",
        "low",
        "Existing access detected",
        "The diff engine will avoid duplicating permissions that are already active.",
        "permit",
      ),
    );
  }

  const maxDurationHours = resource?.classification === "restricted" ? 2 : resource?.environment === "production" ? 4 : 24;
  if (request.durationHours > maxDurationHours) {
    score += 10;
    findings.push(
      finding(
        "expiry.duration_reduced",
        "medium",
        "Duration reduced",
        `Requested duration was capped at ${maxDurationHours} hours.`,
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
        "Human approval required",
        "GrantGuard never applies an access change without an explicit named approver.",
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
