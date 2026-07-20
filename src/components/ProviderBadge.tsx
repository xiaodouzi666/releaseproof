import { AlertCircle, Radio, WifiOff } from "lucide-react";
import type { HealthInfo, WorkflowMetadata } from "../types";

interface ProviderBadgeProps {
  health?: HealthInfo;
  metadata?: WorkflowMetadata;
  loading?: boolean;
  failed?: boolean;
}

function providerPresentation(health?: HealthInfo, metadata?: WorkflowMetadata) {
  const mode = (metadata?.providerMode ?? health?.providerMode ?? "").toLowerCase();
  const model = metadata?.model ?? health?.model;
  const provider = metadata?.provider;

  if (mode.includes("recorded") || mode === "demo" || mode.includes("fixture")) {
    return {
      kind: "recorded",
      label: "Recorded Demo",
      detail: [provider, model].filter(Boolean).join(" · ") || "Deterministic trace",
    };
  }
  if (mode.includes("live") || mode.includes("qwen") || mode === "cloud") {
    const completedCalls = (metadata?.calls ?? 0) > 0;
    return {
      kind: completedCalls ? "live" : "neutral",
      label: completedCalls ? "Qwen Cloud · Live" : "Qwen configured",
      detail: completedCalls
        ? [provider, model, `${metadata?.calls} call${metadata?.calls === 1 ? "" : "s"}`].filter(Boolean).join(" · ")
        : [provider, model, "awaiting a successful release run"].filter(Boolean).join(" · ") || "Credentials configured",
    };
  }
  if (mode) {
    return {
      kind: "neutral",
      label: mode.replace(/[_-]+/g, " "),
      detail: model || "Backend provider mode",
    };
  }
  return {
    kind: "neutral",
    label: "Provider pending",
    detail: "Awaiting backend metadata",
  };
}

export function ProviderBadge({ health, metadata, loading, failed }: ProviderBadgeProps) {
  if (loading) {
    return (
      <div className="provider-badge provider-badge--neutral" aria-label="Checking provider status">
        <span className="provider-dot provider-dot--pulse" />
        <span>
          <strong>Checking runtime</strong>
          <small>Reading backend metadata</small>
        </span>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="provider-badge provider-badge--offline" aria-label="Backend unavailable">
        <WifiOff size={15} aria-hidden="true" />
        <span>
          <strong>Backend unavailable</strong>
          <small>Release controls offline</small>
        </span>
      </div>
    );
  }

  const presentation = providerPresentation(health, metadata);
  const Icon = presentation.kind === "live" ? Radio : presentation.kind === "recorded" ? AlertCircle : Radio;
  return (
    <div
      className={`provider-badge provider-badge--${presentation.kind}`}
      aria-label={`${presentation.label}. ${presentation.detail}`}
    >
      <Icon size={15} aria-hidden="true" />
      <span>
        <strong>{presentation.label}</strong>
        <small>{presentation.detail}</small>
      </span>
    </div>
  );
}
