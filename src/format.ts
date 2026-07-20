import type { WorkflowStatus } from "./types";

export const formatStatus = (status: WorkflowStatus): string => {
  const labels: Record<WorkflowStatus, string> = {
    received: "Release request captured",
    analyzing: "Understanding release intent",
    planning: "Building governed manifest",
    awaiting_approval: "Data owner approval required",
    approved: "Release approved",
    executing: "Creating temporary release",
    verifying: "Proving delivered scope",
    completed: "Release proven & scheduled",
    denied: "Release policy denied",
    rejected: "Release rejected",
    rolling_back: "Recalling release",
    rolled_back: "Release recalled",
    revoked: "Release recalled",
    failed: "Release run needs attention",
  };
  return labels[status];
};

const releaseProfiles: Record<string, string> = {
  viewer: "Aggregate tier",
  contributor: "Profile tier",
  operator: "Contact-export tier",
  admin: "Raw-data tier",
  "no access": "No active release",
  pending: "Pending policy",
  unspecified: "Unspecified profile",
};

const releaseActions: Record<string, string> = {
  "aggregate.read": "Aggregate metrics",
  "profile.read": "Pseudonymous profiles",
  "email.export": "Email addresses",
  "phone.export": "Phone numbers",
  "raw.export": "Raw rows",
  "consent.override": "Consent override",
  read: "approved fields",
  list: "consented records",
  logs: "delivery diagnostics",
  write: "derived campaign output",
  deploy: "activate vendor release",
  restart: "refresh delivery job",
  "iam.manage": "change recipient controls",
  delete: "delete source records",
};

/**
 * The service deliberately keeps its stable access-control-shaped API while
 * ReleaseProof presents the narrower outbound-data product. These helpers keep
 * implementation vocabulary from leaking into the operator experience.
 */
export const formatReleaseProfile = (value?: string): string => {
  if (!value) return "Unspecified profile";
  return releaseProfiles[value.trim().toLowerCase()] ?? releaseLanguage(value);
};

export const formatReleaseAction = (value?: string): string => {
  if (!value) return "release scope";
  return releaseActions[value.trim().toLowerCase()] ?? releaseLanguage(value);
};

export const releaseLanguage = (value?: string): string => {
  if (!value) return "";
  return value
    .replace(/\bGrantGuard\b/gi, "ReleaseProof")
    .replace(/GRANT_/g, "RELEASE_")
    .replace(/_GRANT/g, "_RELEASE")
    .replace(/\bIAM\.grant\b/gi, "release.create")
    .replace(/\bIAM\.verify\b/gi, "release.verify")
    .replace(/\bIAM\.revoke\b/gi, "release.recall")
    .replace(/\bshare\.grant\b/gi, "share.create")
    .replace(/\bshare\.verify\b/gi, "release.prove")
    .replace(/\baggregate\.read\b/gi, "aggregate metrics")
    .replace(/\bprofile\.read\b/gi, "pseudonymous profiles")
    .replace(/\bemail\.export\b/gi, "email addresses")
    .replace(/\bphone\.export\b/gi, "phone numbers")
    .replace(/\braw\.export\b/gi, "raw rows")
    .replace(/\bconsent\.override\b/gi, "consent override")
    .replace(/\bdirectory\.lookup\b/gi, "recipient.lookup")
    .replace(/\bresource\.lookup\b/gi, "dataset.lookup")
    .replace(/\baccess\.current\b/gi, "release.current")
    .replace(/\bticket\.lookup\b/gi, "evidence.lookup")
    .replace(/\baccess\.diff\b/gi, "manifest.diff")
    .replace(/\bSandbox IAM\b/gi, "release sandbox")
    .replace(/\bIAM sandbox\b/gi, "release sandbox")
    .replace(/\bIAM[- ]management\b/gi, "recipient-control management")
    .replace(/\bIAM\b/gi, "recipient controls")
    .replace(/\bleast[- ]privilege\b/gi, "field-minimized")
    .replace(/\baccess request tickets?\b/gi, "data release requests")
    .replace(/\baccess tickets?\b/gi, "data release requests")
    .replace(/\baccess requests?\b/gi, "release requests")
    .replace(/\badministrator access\b/gi, "full-dataset release")
    .replace(/\badmin access\b/gi, "full-dataset release")
    .replace(/\boperator access\b/gi, "operational delivery")
    .replace(/\bcontributor access\b/gi, "approved-field release")
    .replace(/\bviewer access\b/gi, "masked-view release")
    .replace(/\bpermission diff\b/gi, "release manifest diff")
    .replace(/\bpermissions\b/gi, "release scope")
    .replace(/\bpermission\b/gi, "release scope")
    .replace(/\bcurrent access\b/gi, "active releases")
    .replace(/\bno access\b/gi, "no active release")
    .replace(/\btemporary grants?\b/gi, "temporary releases")
    .replace(/\bgrant lifecycle\b/gi, "release lifecycle")
    .replace(/\bgrant IDs?\b/gi, "release IDs")
    .replace(/\bgrants\b/gi, "releases")
    .replace(/\bgrant\b/gi, "release")
    .replace(/\brolling back\b/gi, "recalling")
    .replace(/\brolled back\b/gi, "recalled")
    .replace(/\brollback\b/gi, "recall")
    .replace(/\brevocation\b/gi, "recall")
    .replace(/\brevoking\b/gi, "recalling")
    .replace(/\brevoked\b/gi, "recalled")
    .replace(/\brevoke\b/gi, "recall")
    .replace(/\bticket evidence\b/gi, "request evidence")
    .replace(/\btickets?\b/gi, "request records")
    .replace(/\brequested role\b/gi, "requested release profile")
    .replace(/\badmin(?:istrator)? role\b/gi, "full-dataset profile")
    .replace(/\boperator role\b/gi, "operational-delivery profile")
    .replace(/\bcontributor role\b/gi, "approved-field profile")
    .replace(/\bviewer role\b/gi, "masked-view profile")
    .replace(/\badmin tier\b/gi, "raw-data tier")
    .replace(/\boperator tier\b/gi, "contact-export tier")
    .replace(/\bcontributor tier\b/gi, "profile tier")
    .replace(/\bviewer tier\b/gi, "aggregate tier")
    .replace(/\brole\b/gi, "release profile")
    .replace(/\bsubject\b/gi, "vendor recipient")
    .replace(/\bsecurity reviewer\b/gi, "data owner reviewer")
    .replace(/\bpolicy-engine\b/gi, "release policy")
    .replace(/\bapprover\b/gi, "data owner")
    .replace(/\brequester\b/gi, "release requester")
    .replace(/\bcontrol plane\b/gi, "release control")
    .replace(/\bresource\b/gi, "dataset")
    .replace(/\baccess\b/gi, "release");
};

export const formatDuration = (milliseconds?: number): string => {
  if (milliseconds === undefined || !Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`;
  return `${(milliseconds / 60_000).toFixed(1)} min`;
};

export const formatDateTime = (value?: string): string => {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

export const relativeTime = (value?: string): string => {
  if (!value) return "now";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return value;
  const delta = Date.now() - timestamp;
  if (delta < 10_000) return "now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return formatDateTime(value);
};

export const sentenceCase = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/^\w/, (character) => character.toUpperCase());

export const compactId = (value: string): string => (value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value);
