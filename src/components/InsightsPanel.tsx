import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Gauge,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { ComponentType } from "react";
import { formatDateTime, releaseLanguage } from "../format";
import type { EvaluationInfo, MetricDatum } from "../types";

interface InsightsPanelProps {
  metrics: MetricDatum[];
  evaluation?: EvaluationInfo;
  loading: boolean;
  error?: string;
}

const iconFor = (key: string): ComponentType<{ size?: number }> => {
  const value = key.toLowerCase();
  if (value.includes("latency") || value.includes("time")) return Clock3;
  if (value.includes("qwen") || value.includes("token") || value.includes("call")) return Bot;
  if (value.includes("rate") || value.includes("pass")) return Target;
  if (value.includes("workflow") || value.includes("total")) return Activity;
  return Gauge;
};

function MetricTiles({ values, compact = false }: { values: MetricDatum[]; compact?: boolean }) {
  return (
    <div className={`metric-tiles ${compact ? "metric-tiles--compact" : ""}`}>
      {values.map((metric) => {
        const Icon = iconFor(metric.key);
        return (
          <div className="metric-tile" key={metric.key}>
            <span className="metric-icon"><Icon size={17} /></span>
            <span><small>{releaseLanguage(metric.label)}</small><strong>{metric.value}</strong>{metric.detail ? <em>{releaseLanguage(metric.detail)}</em> : null}</span>
          </div>
        );
      })}
    </div>
  );
}

export function InsightsPanel({ metrics, evaluation, loading, error }: InsightsPanelProps) {
  return (
    <section className="insights-section" aria-labelledby="insights-title">
      <div className="section-heading section-heading--split">
        <div>
          <span className="eyebrow"><BarChart3 size={14} /> Release evidence</span>
          <h2 id="insights-title">Proven, not presumed.</h2>
        </div>
        <p>Runtime telemetry and a fixed release-policy suite expose behavior beyond a happy-path vendor handoff.</p>
      </div>

      {error ? <div className="inline-notice">Metrics are not available yet: {error}</div> : null}
      <div className="insights-grid">
        <article className="insight-card">
          <div className="insight-card-heading">
            <span className="insight-icon"><Activity size={19} /></span>
            <div><small>Runtime</small><h3>Release-control metrics</h3></div>
            <span className="source-chip">/api/metrics</span>
          </div>
          {loading ? (
            <div className="metric-loading"><span /><span /><span /><span /></div>
          ) : metrics.length ? (
            <MetricTiles values={metrics.slice(0, 6)} />
          ) : (
            <div className="metric-empty"><Gauge size={24} /><span>Metrics populate as release runs complete.</span></div>
          )}
        </article>

        <article className="insight-card insight-card--evaluation">
          <div className="insight-card-heading">
            <span className="insight-icon"><FlaskConical size={19} /></span>
            <div><small>Evaluation</small><h3>{releaseLanguage(evaluation?.title || "Release safety evaluation")}</h3></div>
            <span className="source-chip">/api/evaluation</span>
          </div>
          {loading ? (
            <div className="metric-loading"><span /><span /><span /><span /></div>
          ) : evaluation?.metrics.length ? (
            <>
              <MetricTiles values={evaluation.metrics.slice(0, 6)} compact />
              <div className="evaluation-foot">
                <span><ShieldCheck size={15} /> {evaluation.samples ? `${evaluation.samples} fixed release cases` : "Deterministic release suite"}</span>
                {evaluation.updatedAt ? <time dateTime={evaluation.updatedAt}>{formatDateTime(evaluation.updatedAt)}</time> : null}
              </div>
            </>
          ) : (
            <div className="metric-empty"><CheckCircle2 size={24} /><span>Evaluation results are loading from the backend.</span></div>
          )}
        </article>
      </div>
    </section>
  );
}
