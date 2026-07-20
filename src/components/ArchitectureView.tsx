import {
  ArrowRight,
  Bot,
  Boxes,
  Braces,
  CheckCircle2,
  Cloud,
  Database,
  Eye,
  FileImage,
  Fingerprint,
  GitBranch,
  KeyRound,
  LockKeyhole,
  Network,
  RotateCcw,
  Scale,
  ShieldCheck,
  TimerReset,
  UserCheck,
  Wrench,
} from "lucide-react";
import type { HealthInfo } from "../types";

interface ArchitectureViewProps {
  health?: HealthInfo;
  onLaunch: () => void;
}

const guardrails = [
  {
    icon: Scale,
    number: "01",
    title: "Policy outranks prediction",
    text: "Qwen proposes structured intent and a read plan. Deterministic code validates recipient eligibility, dataset classification, agreement status and recipient match, field scope, and duration.",
  },
  {
    icon: UserCheck,
    number: "02",
    title: "Release stops for its owner",
    text: "The autopilot cannot approve its own delivery. A named data owner sees the exact recipient, dataset, fields, tier, and expiry diff before anything leaves.",
  },
  {
    icon: Fingerprint,
    number: "03",
    title: "Observed state is truth",
    text: "Idempotency prevents duplicate releases, read-after-release proves the actual manifest, and a hash-linked audit makes every step inspectable.",
  },
  {
    icon: TimerReset,
    number: "04",
    title: "Recall is built in",
    text: "Every vendor release is time-bound. Scheduled expiry and one-click verified recall close the channel when the purpose ends or reality drifts.",
  },
];

export function ArchitectureView({ health, onLaunch }: ArchitectureViewProps) {
  const mode = health?.providerMode?.toLowerCase() || "";
  const recorded = mode.includes("recorded") || mode.includes("fixture");
  return (
    <main className="architecture-view">
      <section className="architecture-hero">
        <div className="architecture-hero-copy">
          <span className="eyebrow"><GitBranch size={14} /> Architecture & build story</span>
          <h1>Language models interpret.<br /><span>Release controls decide.</span></h1>
          <p>
            ReleaseProof turns an ambiguous vendor brief into a field-minimized, time-bound data release—without giving the model authority to send a single record.
          </p>
          <div className="architecture-cta-row">
            <button className="button button--primary button--large" type="button" onClick={onLaunch}>Open release room <ArrowRight size={18} /></button>
            <span className={`architecture-mode ${recorded ? "architecture-mode--recorded" : ""}`}>
              <span /> {recorded ? "Recorded Demo mode disclosed" : health?.providerMode || "Runtime mode reported by backend"}
            </span>
          </div>
        </div>
        <div className="architecture-hero-mark" aria-hidden="true">
          <div className="orbit orbit--one" />
          <div className="orbit orbit--two" />
          <div className="architecture-shield"><ShieldCheck size={76} strokeWidth={1.1} /></div>
          <span className="orbit-label orbit-label--one">reason</span>
          <span className="orbit-label orbit-label--two">constrain</span>
          <span className="orbit-label orbit-label--three">verify</span>
        </div>
      </section>

      <section className="architecture-section" aria-labelledby="system-map-title">
        <div className="section-heading section-heading--split">
          <div><span className="eyebrow"><Network size={14} /> System map</span><h2 id="system-map-title">One release. Two trust domains.</h2></div>
          <p>Generative interpretation is separated from deterministic data authorization and delivery.</p>
        </div>

        <div className="system-map" role="img" aria-label="ReleaseProof architecture from vendor request through Qwen Cloud, data policy, owner approval, release sandbox, read-back proof, recall, and audit store">
          <div className="map-lane map-lane--reasoning">
            <span className="lane-label"><Bot size={14} /> Probabilistic reasoning</span>
            <div className="map-node">
              <span><FileImage size={21} /></span><div><small>01 · Intake</small><strong>Brief + screenshot</strong><em>Ambiguous data ask</em></div>
            </div>
            <ArrowRight className="map-arrow" size={19} />
            <div className="map-node map-node--qwen">
              <span><Cloud size={21} /></span><div><small>02 · Qwen Cloud</small><strong>Extract + plan</strong><em>Structured JSON only</em></div>
            </div>
          </div>

          <div className="trust-boundary"><span><LockKeyhole size={13} /> Validation boundary</span></div>

          <div className="map-lane map-lane--control">
            <span className="lane-label"><ShieldCheck size={14} /> Deterministic control plane</span>
            <div className="map-node">
              <span><Wrench size={21} /></span><div><small>03 · Context tools</small><strong>Vendor + catalog + agreement</strong><em>Allowlisted reads</em></div>
            </div>
            <ArrowRight className="map-arrow" size={19} />
            <div className="map-node">
              <span><Scale size={21} /></span><div><small>04 · Policy</small><strong>Field + TTL minimization</strong><em>Hard deny wins</em></div>
            </div>
            <ArrowRight className="map-arrow" size={19} />
            <div className="map-node map-node--human">
              <span><UserCheck size={21} /></span><div><small>05 · Owner gate</small><strong>Approve / reject manifest</strong><em>No silent release</em></div>
            </div>
            <ArrowRight className="map-arrow" size={19} />
            <div className="map-node">
              <span><KeyRound size={21} /></span><div><small>06 · Release sandbox</small><strong>Create + prove</strong><em>Idempotent action</em></div>
            </div>
          </div>

          <div className="map-sinks">
            <div><Database size={18} /><span><strong>Hash-linked audit</strong><small>Append-only event chain</small></span></div>
            <div><TimerReset size={18} /><span><strong>Time-bound release</strong><small>Expiry by default</small></span></div>
            <div><RotateCcw size={18} /><span><strong>Verified recall</strong><small>Closes drift safely</small></span></div>
          </div>
        </div>
      </section>

      <section className="architecture-section guardrails-section" aria-labelledby="guardrails-title">
        <div className="section-heading section-heading--split">
          <div><span className="eyebrow"><ShieldCheck size={14} /> Safety model</span><h2 id="guardrails-title">Guardrails that change the outcome.</h2></div>
          <p>Not decorative warnings—enforced boundaries in the release state machine.</p>
        </div>
        <div className="guardrail-grid">
          {guardrails.map((item) => {
            const Icon = item.icon;
            return (
              <article className="guardrail-card" key={item.number}>
                <div className="guardrail-top"><span>{item.number}</span><Icon size={20} /></div>
                <h3>{item.title}</h3><p>{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="architecture-section build-story" aria-labelledby="build-story-title">
        <div className="build-story-copy">
          <span className="eyebrow"><Boxes size={14} /> Why we built it</span>
          <h2 id="build-story-title">Data requests are prose.<br />Released datasets are facts.</h2>
          <p>
            The dangerous gap is the manual translation between them. ReleaseProof behaves like a compiler: Qwen builds typed release intent, policy minimizes it, an owner authorizes the manifest, and deterministic tools create and read the release back.
          </p>
          <ul className="build-principles">
            <li><CheckCircle2 size={16} /><span><strong>Useful ambiguity handling</strong> Vision and language input converge on the same validated schema.</span></li>
            <li><CheckCircle2 size={16} /><span><strong>Production-shaped orchestration</strong> Explicit states, retries, idempotency, read-back proof, recall, and provider disclosure.</span></li>
            <li><CheckCircle2 size={16} /><span><strong>Auditable intelligence</strong> Structured rationale is shown; private chain-of-thought is never exposed or required.</span></li>
          </ul>
        </div>
        <div className="compiler-stack" aria-label="ReleaseProof compiler stages">
          <div><span><Eye size={18} /></span><small>Source</small><strong>Vendor intent</strong><code>text | vision</code></div>
          <div className="compiler-link" />
          <div><span><Braces size={18} /></span><small>IR</small><strong>Validated intent</strong><code>ReleaseIntent</code></div>
          <div className="compiler-link" />
          <div><span><Scale size={18} /></span><small>Minimize</small><strong>Fields + tier + TTL</strong><code>ReleaseManifest</code></div>
          <div className="compiler-link" />
          <div><span><KeyRound size={18} /></span><small>Target</small><strong>Temporary release</strong><code>proven + TTL</code></div>
        </div>
      </section>

      <section className="architecture-footer-cta">
        <span className="cta-grid-mark" aria-hidden="true" />
        <div><span className="eyebrow">Try the full workflow</span><h2>Turn a vague data ask into a proven release.</h2></div>
        <button type="button" className="button button--primary button--large" onClick={onLaunch}>Enter release room <ArrowRight size={18} /></button>
      </section>
    </main>
  );
}
