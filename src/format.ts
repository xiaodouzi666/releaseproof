import type { WorkflowStatus } from "./types";

export const formatStatus = (status: WorkflowStatus): string => {
  const labels: Record<WorkflowStatus, string> = {
    received: "Request received",
    analyzing: "Understanding request",
    planning: "Policy evaluation",
    awaiting_approval: "Human approval required",
    approved: "Approved",
    executing: "Applying temporary grant",
    verifying: "Verifying access",
    completed: "Verified & scheduled",
    denied: "Policy denied",
    rejected: "Request rejected",
    rolling_back: "Rolling back grant",
    rolled_back: "Grant rolled back",
    revoked: "Grant revoked",
    failed: "Workflow needs attention",
  };
  return labels[status];
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
