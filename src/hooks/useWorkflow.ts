import { useCallback, useEffect, useRef, useState } from "react";
import { api, normalizeWorkflow } from "../api";
import type { TimelineEvent, Workflow } from "../types";

const TERMINAL_STATUSES = new Set(["completed", "denied", "rejected", "rolled_back", "revoked", "failed"]);

function eventFromPayload(data: unknown, eventType?: string): TimelineEvent | undefined {
  if (!data || typeof data !== "object") return undefined;
  const item = data as Record<string, unknown>;
  const nested = item.event && typeof item.event === "object" ? (item.event as Record<string, unknown>) : item;
  const title = String(nested.title ?? nested.name ?? nested.step ?? eventType ?? "Agent update");
  const message = String(nested.message ?? nested.description ?? nested.summary ?? "");
  if (!title && !message) return undefined;
  const statusValue = String(nested.status ?? nested.state ?? "completed").toLowerCase();
  return {
    id: String(nested.id ?? nested.eventId ?? `${Date.now()}-${title}`),
    type: String(nested.type ?? nested.kind ?? eventType ?? "agent_step"),
    title,
    message,
    status: ["running", "active", "in_progress"].includes(statusValue)
      ? "active"
      : ["failed", "error", "rejected"].includes(statusValue)
        ? "failed"
        : ["pending", "queued"].includes(statusValue)
          ? "pending"
          : ["blocked", "paused", "awaiting_approval"].includes(statusValue)
            ? "blocked"
            : "completed",
    actor: typeof nested.actor === "string" ? nested.actor : typeof nested.agent === "string" ? nested.agent : undefined,
    tool: typeof nested.tool === "string" ? nested.tool : typeof nested.toolName === "string" ? nested.toolName : undefined,
    timestamp: typeof nested.timestamp === "string" ? nested.timestamp : new Date().toISOString(),
    durationMs: typeof nested.durationMs === "number" ? nested.durationMs : undefined,
  };
}

function mergeEvent(workflow: Workflow, event: TimelineEvent): Workflow {
  const existing = workflow.timeline.findIndex((item) => item.id === event.id);
  const timeline = [...workflow.timeline];
  if (existing >= 0) timeline[existing] = { ...timeline[existing], ...event };
  else timeline.push(event);
  return { ...workflow, timeline };
}

export function useWorkflow(initialWorkflow?: Workflow) {
  const [workflow, setWorkflow] = useState<Workflow | undefined>(initialWorkflow);
  const [streamState, setStreamState] = useState<"idle" | "connecting" | "live" | "polling">("idle");
  const [error, setError] = useState<string>();
  const currentRef = useRef<Workflow | undefined>(initialWorkflow);

  useEffect(() => {
    currentRef.current = workflow;
  }, [workflow]);

  const replaceWorkflow = useCallback((next?: Workflow) => {
    setWorkflow(next);
    currentRef.current = next;
    setError(undefined);
  }, []);

  const refresh = useCallback(async () => {
    if (!currentRef.current?.id || currentRef.current.id === "pending") return;
    try {
      const next = await api.workflow(currentRef.current.id);
      replaceWorkflow(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not refresh workflow");
    }
  }, [replaceWorkflow]);

  useEffect(() => {
    const id = workflow?.id;
    if (!id || id === "pending" || (workflow && TERMINAL_STATUSES.has(workflow.status))) {
      setStreamState("idle");
      return;
    }

    let disposed = false;
    let source: EventSource | undefined;
    let pollTimer: number | undefined;
    let lastEventAt = Date.now();

    const startPolling = () => {
      if (disposed || pollTimer) return;
      setStreamState("polling");
      const poll = async () => {
        if (disposed) return;
        try {
          const next = await api.workflow(id);
          replaceWorkflow(next);
          if (!TERMINAL_STATUSES.has(next.status)) pollTimer = window.setTimeout(poll, 1600);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Workflow connection interrupted");
          pollTimer = window.setTimeout(poll, 3200);
        }
      };
      void poll();
    };

    if (typeof EventSource === "undefined") {
      startPolling();
      return () => {
        disposed = true;
        if (pollTimer) window.clearTimeout(pollTimer);
      };
    }

    setStreamState("connecting");
    source = new EventSource(`/api/workflows/${encodeURIComponent(id)}/events`);
    source.onopen = () => {
      lastEventAt = Date.now();
      setStreamState("live");
      setError(undefined);
    };
    source.onmessage = (message) => {
      lastEventAt = Date.now();
      try {
        const data: unknown = JSON.parse(message.data);
        const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
        if (payload.workflow || payload.status || payload.permissionDiff || payload.extractedRequest) {
          const next = normalizeWorkflow(payload.workflow ?? payload);
          if (next.id === "pending") next.id = id;
          replaceWorkflow(next);
        } else {
          const event = eventFromPayload(data, message.type);
          if (event) setWorkflow((current) => (current ? mergeEvent(current, event) : current));
        }
      } catch {
        // Heartbeats and non-JSON comments are expected in some SSE implementations.
      }
    };
    source.addEventListener("snapshot", (message) => {
      lastEventAt = Date.now();
      try {
        const next = normalizeWorkflow(JSON.parse(message.data));
        if (next.id === "pending") next.id = id;
        replaceWorkflow(next);
      } catch {
        startPolling();
      }
    });
    source.addEventListener("audit", (message) => {
      lastEventAt = Date.now();
      try {
        const event = eventFromPayload(JSON.parse(message.data), "audit");
        if (event) setWorkflow((current) => (current ? mergeEvent(current, event) : current));
        void refresh();
      } catch {
        // Ignore malformed event frames and let the next snapshot reconcile state.
      }
    });
    source.onerror = () => {
      source?.close();
      startPolling();
    };

    const staleTimer = window.setInterval(() => {
      if (!disposed && Date.now() - lastEventAt > 6000) void refresh();
    }, 4000);

    return () => {
      disposed = true;
      source?.close();
      if (pollTimer) window.clearTimeout(pollTimer);
      window.clearInterval(staleTimer);
    };
  }, [workflow?.id, workflow?.status, replaceWorkflow, refresh]);

  return { workflow, setWorkflow: replaceWorkflow, streamState, error, refresh };
}
