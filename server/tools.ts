import { randomUUID } from "node:crypto";
import type {
  AccessDiff,
  AccessGrant,
  DirectoryUser,
  ExtractedAccessRequest,
  PolicyDecision,
  ResourceProfile,
  TicketEvidence,
  VerificationResult,
} from "../shared/contracts.js";

const DIRECTORY: DirectoryUser[] = [
  {
    id: "usr_alice",
    email: "alice@acme.example",
    displayName: "Alice Chen",
    department: "Site Reliability Engineering",
    managerEmail: "marcus@acme.example",
    employmentType: "employee",
    active: true,
    mfaEnrolled: true,
    clearance: "restricted",
  },
  {
    id: "usr_nina",
    email: "nina.contractor@acme.example",
    displayName: "Nina Patel",
    department: "Finance Transformation",
    managerEmail: "priya@acme.example",
    employmentType: "contractor",
    active: true,
    mfaEnrolled: true,
    clearance: "standard",
  },
  {
    id: "usr_mateo",
    email: "mateo@acme.example",
    displayName: "Mateo Silva",
    department: "Storefront Engineering",
    managerEmail: "dana@acme.example",
    employmentType: "employee",
    active: true,
    mfaEnrolled: true,
    clearance: "confidential",
  },
  {
    id: "usr_former",
    email: "former.employee@acme.example",
    displayName: "Former Employee",
    department: "Alumni",
    managerEmail: "security@acme.example",
    employmentType: "employee",
    active: false,
    mfaEnrolled: false,
    clearance: "standard",
  },
  {
    id: "usr_jordan",
    email: "jordan@acme.example",
    displayName: "Jordan Lee",
    department: "Product Analytics",
    managerEmail: "ava@acme.example",
    employmentType: "employee",
    active: true,
    mfaEnrolled: true,
    clearance: "confidential",
  },
];

const RESOURCES: ResourceProfile[] = [
  {
    id: "payments-prod",
    name: "Payments Production",
    environment: "production",
    classification: "confidential",
    ownerEmail: "payments-owners@acme.example",
    allowedRoles: ["viewer", "operator"],
  },
  {
    id: "finance-ledger-prod",
    name: "Finance Ledger Production",
    environment: "production",
    classification: "restricted",
    ownerEmail: "finance-security@acme.example",
    allowedRoles: ["viewer", "contributor"],
  },
  {
    id: "storefront-staging",
    name: "Storefront Staging",
    environment: "staging",
    classification: "internal",
    ownerEmail: "storefront-owners@acme.example",
    allowedRoles: ["viewer", "contributor", "operator"],
  },
  {
    id: "analytics-prod",
    name: "Analytics Production",
    environment: "production",
    classification: "confidential",
    ownerEmail: "data-platform@acme.example",
    allowedRoles: ["viewer", "operator"],
  },
  {
    id: "developer-sandbox",
    name: "Developer Sandbox",
    environment: "development",
    classification: "internal",
    ownerEmail: "developer-experience@acme.example",
    allowedRoles: ["viewer", "contributor", "operator", "admin"],
  },
];

const TICKETS: TicketEvidence[] = [
  {
    ticketId: "INC-4821",
    title: "Checkout production incident response",
    status: "in_progress",
    ownerEmail: "incident-command@acme.example",
    referenceOnly: true,
  },
  {
    ticketId: "FIN-992",
    title: "External finance reconciliation",
    status: "open",
    ownerEmail: "finance-security@acme.example",
    referenceOnly: true,
  },
  {
    ticketId: "DEV-193",
    title: "Storefront search staging rollout",
    status: "open",
    ownerEmail: "storefront-owners@acme.example",
    referenceOnly: true,
  },
  {
    ticketId: "OPS-771",
    title: "Analytics pipeline recovery",
    status: "closed",
    ownerEmail: "data-platform@acme.example",
    referenceOnly: true,
  },
  {
    ticketId: "DATA-624",
    title: "Q3 analytics planning review",
    status: "open",
    ownerEmail: "data-platform@acme.example",
    referenceOnly: true,
  },
  {
    ticketId: "SEC-902",
    title: "Sandbox security exercise",
    status: "in_progress",
    ownerEmail: "security@acme.example",
    referenceOnly: true,
  },
];

function seededGrant(
  grantId: string,
  subjectEmail: string,
  resourceId: string,
  role: ExtractedAccessRequest["requestedRole"],
  actions: string[],
  now: Date,
): AccessGrant {
  return {
    grantId,
    subjectEmail,
    resourceId,
    role,
    actions,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 48 * 3_600_000).toISOString(),
    status: "active",
    idempotencyKey: `seed:${grantId}`,
  };
}

export interface DesiredAccessState {
  role: ExtractedAccessRequest["requestedRole"];
  actions: string[];
  expiresAt: string;
}

export interface ApplyDesiredAccessResult {
  grant: AccessGrant;
  replacedGrants: AccessGrant[];
  replayed: boolean;
}

export class StaleGrantError extends Error {
  constructor(
    operation: "apply" | "rollback",
    public readonly expectedGrantIds: string[],
    public readonly actualGrantIds: string[],
  ) {
    super(
      `Stale ${operation} baseline: expected active grant(s) [${expectedGrantIds.join(", ") || "none"}], ` +
        `found [${actualGrantIds.join(", ") || "none"}]`,
    );
    this.name = "StaleGrantError";
  }
}

export class ExpiredProposalError extends Error {
  constructor(public readonly expiresAt: string) {
    super(`Reviewed access proposal expired at ${expiresAt}; no IAM mutation was applied`);
    this.name = "ExpiredProposalError";
  }
}

export interface RestoreBaselineResult {
  revokedGrant: AccessGrant;
  restoredGrants: AccessGrant[];
  replayed: boolean;
}

export interface ExpectedAccessState extends DesiredAccessState {
  grantId?: string;
}

export interface EffectiveStateTarget {
  subjectEmail: string;
  resourceId: string;
  grant: AccessGrant | null;
}

/** In-memory IAM adapter. It deliberately models only the sandbox, never real IAM. */
export class IamSandbox {
  private readonly grants = new Map<string, AccessGrant>();
  private readonly idempotency = new Map<string, string>();
  private readonly applications = new Map<string, { grantId: string; replacedGrants: AccessGrant[] }>();
  private readonly rollbacks = new Map<string, { revokedGrantId: string; restoredGrantIds: string[] }>();

  constructor(private readonly clock: () => Date = () => new Date()) {
    const now = this.clock();
    const seeds = [
      seededGrant("gr_seed_jordan", "jordan@acme.example", "analytics-prod", "operator", [
        "read",
        "list",
        "logs",
        "restart",
      ], now),
      seededGrant("gr_seed_mateo", "mateo@acme.example", "storefront-staging", "viewer", ["read", "list"], now),
    ];
    for (const grant of seeds) {
      this.grants.set(grant.grantId, grant);
      this.idempotency.set(grant.idempotencyKey, grant.grantId);
    }
  }

  list(subjectEmail: string, resourceId?: string): AccessGrant[] {
    this.expireDueGrants();
    return [...this.grants.values()]
      .filter(
        (grant) =>
          grant.subjectEmail.toLowerCase() === subjectEmail.toLowerCase() &&
          (!resourceId || grant.resourceId === resourceId),
      )
      .map((grant) => structuredClone(grant));
  }

  current(subjectEmail: string, resourceId: string): AccessGrant[] {
    return this.list(subjectEmail, resourceId).filter((grant) => grant.status === "active");
  }

  grant(input: {
    subjectEmail: string;
    resourceId: string;
    role: ExtractedAccessRequest["requestedRole"];
    actions: string[];
    expiresAt: string;
    idempotencyKey: string;
    expectedBaseline: AccessGrant[];
  }): ApplyDesiredAccessResult {
    const previousApplication = this.applications.get(input.idempotencyKey);
    if (previousApplication) {
      const existing = this.grants.get(previousApplication.grantId);
      if (existing) {
        return {
          grant: structuredClone(existing),
          replacedGrants: structuredClone(previousApplication.replacedGrants),
          replayed: true,
        };
      }
    }
    const existingId = this.idempotency.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.grants.get(existingId);
      if (existing) return { grant: structuredClone(existing), replacedGrants: [], replayed: true };
    }

    const actions = [...new Set(input.actions.map((action) => action.trim()))].filter(Boolean);
    if (!actions.length) throw new Error("Exact desired access requires at least one explicit action");
    const expiresAtMs = new Date(input.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) throw new Error("Exact desired access requires a valid expiry");
    const nowDate = this.clock();
    if (expiresAtMs <= nowDate.getTime() + 60_000) throw new ExpiredProposalError(input.expiresAt);
    const currentBaseline = this.effectiveCurrentWithoutMutation(input.subjectEmail, input.resourceId, nowDate);
    const expectedBaseline = input.expectedBaseline.filter(
      (grant) => grant.status === "active" && new Date(grant.expiresAt).getTime() > nowDate.getTime(),
    );
    if (this.canonicalBaseline(currentBaseline) !== this.canonicalBaseline(expectedBaseline)) {
      throw new StaleGrantError(
        "apply",
        expectedBaseline.map((grant) => grant.grantId),
        currentBaseline.map((grant) => grant.grantId),
      );
    }
    const replacedGrants = structuredClone(currentBaseline);
    const now = nowDate.toISOString();
    const grant: AccessGrant = {
      grantId: `gr_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
      subjectEmail: input.subjectEmail,
      resourceId: input.resourceId,
      role: input.role,
      actions,
      createdAt: now,
      expiresAt: new Date(expiresAtMs).toISOString(),
      status: "active",
      idempotencyKey: input.idempotencyKey,
    };

    // Validation is complete before this point. The synchronous mutations below
    // form one atomic sandbox transaction: old effective grants are revoked and
    // exactly one desired grant becomes active.
    for (const replaced of replacedGrants) {
      const stored = this.grants.get(replaced.grantId)!;
      stored.status = "revoked";
      stored.revokedAt = now;
    }
    this.grants.set(grant.grantId, grant);
    this.idempotency.set(input.idempotencyKey, grant.grantId);
    this.applications.set(input.idempotencyKey, {
      grantId: grant.grantId,
      replacedGrants: structuredClone(replacedGrants),
    });
    return { grant: structuredClone(grant), replacedGrants: structuredClone(replacedGrants), replayed: false };
  }

  revoke(grantId: string): { grant: AccessGrant; replayed: boolean } {
    this.expireDueGrants();
    const grant = this.grants.get(grantId);
    if (!grant) throw new Error(`Sandbox grant ${grantId} does not exist`);
    if (grant.status === "revoked") return { grant: structuredClone(grant), replayed: true };
    grant.status = "revoked";
    grant.revokedAt = this.clock().toISOString();
    return { grant: structuredClone(grant), replayed: false };
  }

  restore(grant: AccessGrant): void {
    this.grants.set(grant.grantId, structuredClone(grant));
    this.idempotency.set(grant.idempotencyKey, grant.grantId);
  }

  restoreBaseline(input: {
    grantId: string;
    baseline: AccessGrant[];
    idempotencyKey: string;
  }): RestoreBaselineResult {
    const prior = this.rollbacks.get(input.idempotencyKey);
    if (prior) {
      const revokedGrant = this.grants.get(prior.revokedGrantId);
      if (!revokedGrant) throw new Error(`Sandbox grant ${prior.revokedGrantId} does not exist`);
      return {
        revokedGrant: structuredClone(revokedGrant),
        restoredGrants: prior.restoredGrantIds
          .map((grantId) => this.grants.get(grantId))
          .filter((grant): grant is AccessGrant => Boolean(grant))
          .map((grant) => structuredClone(grant)),
        replayed: true,
      };
    }

    const changedGrant = this.grants.get(input.grantId);
    if (!changedGrant) throw new Error(`Sandbox grant ${input.grantId} does not exist`);
    const restoreNow = this.clock();
    const baseline = input.baseline
      .filter(
        (grant) => grant.status === "active" && new Date(grant.expiresAt).getTime() > restoreNow.getTime(),
      )
      .map((grant) => structuredClone(grant));
    if (
      baseline.some(
        (grant) =>
          grant.subjectEmail.toLowerCase() !== changedGrant.subjectEmail.toLowerCase() ||
          grant.resourceId !== changedGrant.resourceId,
      )
    ) {
      throw new Error("Rollback baseline does not belong to the changed subject and resource");
    }

    const current = this.effectiveCurrentWithoutMutation(
      changedGrant.subjectEmail,
      changedGrant.resourceId,
      restoreNow,
    );
    if (current.length !== 1 || current[0]!.grantId !== input.grantId) {
      throw new StaleGrantError(
        "rollback",
        [input.grantId],
        current.map((grant) => grant.grantId),
      );
    }

    const now = restoreNow.toISOString();
    const activeForTarget = current;
    for (const active of activeForTarget) {
      const stored = this.grants.get(active.grantId)!;
      stored.status = "revoked";
      stored.revokedAt = now;
    }
    for (const original of baseline) {
      original.status = "active";
      delete original.revokedAt;
      this.grants.set(original.grantId, original);
      this.idempotency.set(original.idempotencyKey, original.grantId);
    }
    const revokedGrant = this.grants.get(input.grantId)!;
    this.rollbacks.set(input.idempotencyKey, {
      revokedGrantId: revokedGrant.grantId,
      restoredGrantIds: baseline.map((grant) => grant.grantId),
    });
    return {
      revokedGrant: structuredClone(revokedGrant),
      restoredGrants: structuredClone(baseline),
      replayed: false,
    };
  }

  restoreExpiredBaseline(input: {
    grantId: string;
    baseline: AccessGrant[];
    idempotencyKey: string;
  }): RestoreBaselineResult {
    const prior = this.rollbacks.get(input.idempotencyKey);
    if (prior) {
      const revokedGrant = this.grants.get(prior.revokedGrantId);
      if (!revokedGrant) throw new Error(`Sandbox grant ${prior.revokedGrantId} does not exist`);
      return {
        revokedGrant: structuredClone(revokedGrant),
        restoredGrants: prior.restoredGrantIds
          .map((grantId) => this.grants.get(grantId))
          .filter((grant): grant is AccessGrant => Boolean(grant))
          .map((grant) => structuredClone(grant)),
        replayed: true,
      };
    }
    const changedGrant = this.grants.get(input.grantId);
    if (!changedGrant) throw new Error(`Sandbox grant ${input.grantId} does not exist`);
    const now = this.clock();
    if (new Date(changedGrant.expiresAt).getTime() > now.getTime()) {
      throw new Error(`Sandbox grant ${input.grantId} has not expired`);
    }
    const current = this.effectiveCurrentWithoutMutation(changedGrant.subjectEmail, changedGrant.resourceId, now);
    if (current.length) {
      throw new StaleGrantError(
        "rollback",
        [],
        current.map((grant) => grant.grantId),
      );
    }
    const baseline = input.baseline
      .filter((grant) => grant.status === "active" && new Date(grant.expiresAt).getTime() > now.getTime())
      .map((grant) => structuredClone(grant));
    if (
      baseline.some(
        (grant) =>
          grant.subjectEmail.toLowerCase() !== changedGrant.subjectEmail.toLowerCase() ||
          grant.resourceId !== changedGrant.resourceId,
      )
    ) {
      throw new Error("Expiry baseline does not belong to the changed subject and resource");
    }
    changedGrant.status = "revoked";
    changedGrant.revokedAt = now.toISOString();
    for (const original of baseline) {
      original.status = "active";
      delete original.revokedAt;
      this.grants.set(original.grantId, original);
      this.idempotency.set(original.idempotencyKey, original.grantId);
    }
    this.rollbacks.set(input.idempotencyKey, {
      revokedGrantId: changedGrant.grantId,
      restoredGrantIds: baseline.map((grant) => grant.grantId),
    });
    return {
      revokedGrant: structuredClone(changedGrant),
      restoredGrants: structuredClone(baseline),
      replayed: false,
    };
  }

  verify(input: {
    subjectEmail: string;
    resourceId: string;
    expected: ExpectedAccessState | null;
  }): VerificationResult {
    const active = this.current(input.subjectEmail, input.resourceId);
    const observed = active.length === 1 ? active[0]! : undefined;
    const expectedActions = input.expected ? [...new Set(input.expected.actions)].sort() : [];
    const observedActions = observed ? [...new Set(observed.actions)].sort() : [];
    const roleMatches = input.expected ? observed?.role === input.expected.role : active.length === 0;
    const actionsMatch = input.expected ? JSON.stringify(observedActions) === JSON.stringify(expectedActions) : true;
    const expiryMatches = input.expected
      ? observed
        ? new Date(observed.expiresAt).getTime() === new Date(input.expected.expiresAt).getTime()
        : false
      : true;
    const grantMatches = input.expected?.grantId ? observed?.grantId === input.expected.grantId : true;
    const uniqueState = input.expected ? active.length === 1 : active.length === 0;
    const notExpired = input.expected
      ? observed
        ? new Date(observed.expiresAt).getTime() > this.clock().getTime()
        : false
      : true;
    const verified = roleMatches && actionsMatch && expiryMatches && grantMatches && uniqueState && notExpired;

    return {
      verified,
      checkedAt: this.clock().toISOString(),
      expectedRole: input.expected?.role ?? "none",
      observedRole: observed?.role ?? null,
      expectedActions,
      observedActions,
      expectedExpiresAt: input.expected?.expiresAt ?? null,
      observedExpiresAt: observed?.expiresAt ?? null,
      activeGrantCount: active.length,
      details: verified
        ? `Exact-state verification passed: ${active.length} active grant with matching role, actions, and expiry.`
        : `Exact-state verification failed: expected ${input.expected ? "one" : "zero"} active grant, observed ${active.length}; role=${observed?.role ?? "none"}, expiry=${observed?.expiresAt ?? "none"}.`,
    };
  }

  reconcileEffectiveStates(targets: EffectiveStateTarget[]): void {
    this.expireDueGrants();
    const seen = new Set<string>();
    for (const target of targets) {
      const key = `${target.subjectEmail.toLowerCase()}\u0000${target.resourceId}`;
      if (seen.has(key)) throw new Error(`Duplicate effective-state target for ${target.subjectEmail}/${target.resourceId}`);
      seen.add(key);
      if (
        target.grant &&
        (target.grant.subjectEmail.toLowerCase() !== target.subjectEmail.toLowerCase() ||
          target.grant.resourceId !== target.resourceId)
      ) {
        throw new Error("Reconciled grant does not belong to its target subject and resource");
      }
    }

    const now = this.clock();
    for (const target of targets) {
      const active = this.current(target.subjectEmail, target.resourceId);
      for (const grant of active) {
        const stored = this.grants.get(grant.grantId)!;
        stored.status = "revoked";
        stored.revokedAt = now.toISOString();
      }
      if (target.grant && new Date(target.grant.expiresAt).getTime() > now.getTime()) {
        const exact = structuredClone(target.grant);
        exact.status = "active";
        delete exact.revokedAt;
        this.grants.set(exact.grantId, exact);
        this.idempotency.set(exact.idempotencyKey, exact.grantId);
      }
    }
  }

  assertCurrentGrant(grantId: string): void {
    const grant = this.grants.get(grantId);
    if (!grant) throw new StaleGrantError("rollback", [grantId], []);
    const current = this.effectiveCurrentWithoutMutation(grant.subjectEmail, grant.resourceId, this.clock());
    if (current.length !== 1 || current[0]!.grantId !== grantId) {
      throw new StaleGrantError(
        "rollback",
        [grantId],
        current.map((item) => item.grantId),
      );
    }
  }

  private effectiveCurrentWithoutMutation(subjectEmail: string, resourceId: string, now: Date): AccessGrant[] {
    return [...this.grants.values()]
      .filter(
        (grant) =>
          grant.subjectEmail.toLowerCase() === subjectEmail.toLowerCase() &&
          grant.resourceId === resourceId &&
          grant.status === "active" &&
          new Date(grant.expiresAt).getTime() > now.getTime(),
      )
      .map((grant) => structuredClone(grant));
  }

  private canonicalBaseline(grants: AccessGrant[]): string {
    return JSON.stringify(
      grants
        .map((grant) => ({
          grantId: grant.grantId,
          role: grant.role,
          actions: [...new Set(grant.actions)].sort(),
          expiresAt: new Date(grant.expiresAt).toISOString(),
        }))
        .sort((a, b) => a.grantId.localeCompare(b.grantId)),
    );
  }

  private expireDueGrants(): void {
    const now = this.clock();
    const nowMs = now.getTime();
    for (const grant of this.grants.values()) {
      if (grant.status === "active" && new Date(grant.expiresAt).getTime() <= nowMs) {
        grant.status = "revoked";
        grant.revokedAt = now.toISOString();
      }
    }
  }
}

export const iamSandbox = new IamSandbox();

export async function lookupDirectoryUser(email: string): Promise<DirectoryUser | null> {
  return structuredClone(DIRECTORY.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null);
}

export async function lookupResource(resourceId: string): Promise<ResourceProfile | null> {
  return structuredClone(RESOURCES.find((resource) => resource.id === resourceId) ?? null);
}

export async function lookupTicket(ticketId: string): Promise<TicketEvidence | null> {
  return structuredClone(TICKETS.find((ticket) => ticket.ticketId === ticketId) ?? null);
}

export async function getCurrentAccess(subjectEmail: string, resourceId: string): Promise<AccessGrant[]> {
  return iamSandbox.current(subjectEmail, resourceId);
}

export function calculateAccessDiff(input: {
  request: ExtractedAccessRequest;
  decision: PolicyDecision;
  currentAccess: AccessGrant[];
  now?: Date;
}): AccessDiff {
  const { request, decision, currentAccess } = input;
  const now = input.now ?? new Date();
  const active = currentAccess.filter(
    (grant) => grant.status === "active" && new Date(grant.expiresAt).getTime() > now.getTime(),
  );
  const beforeActions = [...new Set(active.flatMap((grant) => grant.actions))];
  const roleRank: Record<ExtractedAccessRequest["requestedRole"], number> = {
    viewer: 0,
    contributor: 1,
    operator: 2,
    admin: 3,
  };
  const strongest = [...active].sort((a, b) => roleRank[b.role] - roleRank[a.role])[0];
  const afterActions = decision.effectiveActions;
  const additions = afterActions.filter((action) => !beforeActions.includes(action));
  const removals = beforeActions.filter((action) => !afterActions.includes(action));
  const unchanged = afterActions.filter((action) => beforeActions.includes(action));
  const hours = Math.max(1, Math.min(request.durationHours, decision.maxDurationHours));
  const expiresAt = new Date(now.getTime() + hours * 3_600_000).toISOString();

  return {
    resourceId: request.resourceId,
    subjectEmail: request.subjectEmail,
    before: { role: strongest?.role ?? null, actions: beforeActions, expiresAt: strongest?.expiresAt },
    after: { role: decision.effectiveRole, actions: afterActions, expiresAt },
    additions,
    removals,
    unchanged,
    summary: `${strongest?.role ?? "no access"} to ${decision.effectiveRole}; ${additions.length} added, ${removals.length} removed; auto-expires in ${hours}h`,
  };
}

export async function grantAccess(input: {
  subjectEmail: string;
  resourceId: string;
  role: ExtractedAccessRequest["requestedRole"];
  actions: string[];
  expiresAt: string;
  idempotencyKey: string;
  expectedBaseline: AccessGrant[];
}): Promise<ApplyDesiredAccessResult> {
  return iamSandbox.grant(input);
}

export async function verifyAccess(input: {
  subjectEmail: string;
  resourceId: string;
  expected: ExpectedAccessState | null;
}): Promise<VerificationResult> {
  return iamSandbox.verify(input);
}

export async function revokeAccess(grantId: string): Promise<{ grant: AccessGrant; replayed: boolean }> {
  return iamSandbox.revoke(grantId);
}

export async function restoreAccessBaseline(input: {
  grantId: string;
  baseline: AccessGrant[];
  idempotencyKey: string;
}): Promise<RestoreBaselineResult> {
  return iamSandbox.restoreBaseline(input);
}

export async function restoreExpiredAccessBaseline(input: {
  grantId: string;
  baseline: AccessGrant[];
  idempotencyKey: string;
}): Promise<RestoreBaselineResult> {
  return iamSandbox.restoreExpiredBaseline(input);
}

export function restoreSandboxGrant(grant: AccessGrant): void {
  iamSandbox.restore(grant);
}

export function reconcileSandboxEffectiveStates(targets: EffectiveStateTarget[]): void {
  iamSandbox.reconcileEffectiveStates(targets);
}

export function assertSandboxGrantIsCurrent(grantId: string): void {
  iamSandbox.assertCurrentGrant(grantId);
}

export function directoryFixture(): DirectoryUser[] {
  return structuredClone(DIRECTORY);
}

export function resourceFixture(): ResourceProfile[] {
  return structuredClone(RESOURCES);
}

export function ticketFixture(): TicketEvidence[] {
  return structuredClone(TICKETS);
}
