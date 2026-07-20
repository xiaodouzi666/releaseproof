import type { Scenario } from "../shared/contracts.js";

export const scenarios: Scenario[] = [
  {
    id: "incident-prod-logs",
    title: "Production incident response",
    eyebrow: "Least privilege reduction",
    description:
      "An SRE asks for broad admin access during an incident. GrantGuard narrows it to time-boxed operator actions.",
    requestText:
      "INC-4821: I am Alice Chen (alice@acme.example). Please give me admin access to payments-prod for 8 hours so I can inspect logs, restart the checkout service, and resolve the active incident. My manager is aware.",
    expectedOutcome: "requires_approval",
    expectedRisk: "critical",
    tags: ["production", "incident", "role reduction"],
  },
  {
    id: "contractor-finance-export",
    title: "Blocked finance export",
    eyebrow: "Deterministic policy veto",
    description:
      "A contractor requests restricted financial data. The policy engine blocks the request regardless of model output.",
    requestText:
      "I am Nina Patel (nina.contractor@acme.example). Grant admin access to finance-ledger-prod for 48 hours so I can export the full customer billing table for an external reconciliation. Ticket FIN-992.",
    expectedOutcome: "deny",
    expectedRisk: "critical",
    tags: ["restricted", "contractor", "deny"],
  },
  {
    id: "developer-staging-deploy",
    title: "Staging deployment",
    eyebrow: "Fast, bounded approval",
    description:
      "A developer receives the minimum contributor permissions required for a single working day.",
    requestText:
      "DEV-193: I am Mateo Silva (mateo@acme.example). I need contributor access to storefront-staging for 12 hours to deploy and validate the new search endpoint. Actions needed: read, write, deploy.",
    expectedOutcome: "requires_approval",
    expectedRisk: "low",
    tags: ["staging", "developer", "time boxed"],
  },
  {
    id: "inactive-account",
    title: "Inactive identity",
    eyebrow: "Identity safety gate",
    description: "The directory reports an inactive identity, so no access change can be proposed or executed.",
    requestText:
      "OPS-771: This is former.employee@acme.example. Restore operator access to analytics-prod for 4 hours so I can check yesterday's pipeline failure and restart jobs.",
    expectedOutcome: "deny",
    expectedRisk: "critical",
    tags: ["inactive", "identity", "deny"],
  },
  {
    id: "analyst-readonly",
    title: "Read-only analytics",
    eyebrow: "Routine access",
    description: "A data analyst requests scoped, expiring read-only access to a confidential analytics resource.",
    requestText:
      "DATA-624: I am Jordan Lee (jordan@acme.example). Please grant viewer access to analytics-prod for 6 hours to read the aggregated conversion dashboard for the Q3 planning review.",
    expectedOutcome: "requires_approval",
    expectedRisk: "high",
    tags: ["analytics", "read only", "approval"],
  },
];

export function findScenario(id: string | undefined): Scenario | undefined {
  return id ? scenarios.find((scenario) => scenario.id === id) : undefined;
}
