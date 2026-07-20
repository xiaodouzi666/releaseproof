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
    text: "Qwen proposes structured intent and a tool plan. Deterministic code validates identity, scope, duration, and every policy invariant.",
  },
  {
    icon: UserCheck,
    number: "02",
    title: "Writes stop for a human",
    text: "The agent cannot approve its own sensitive action. A named reviewer sees the exact diff and evidence before any sandbox grant.",
  },
  {
    icon: Fingerprint,
    number: "03",
    title: "Trust is verified",
    text: "Idempotency prevents duplicate writes, read-after-write confirms outcome, and a hash-linked audit trail makes every step inspectable.",
  },
  {
    icon: TimerReset,
    number: "04",
    title: "Access expires by design",
    text: "Every grant is time-bound. Automatic revocation and one-click rollback reduce standing privilege and recover safely from change.",
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
          <h1>Language models reason.<br /><span>Control planes decide.</span></h1>
          <p>
            GrantGuard turns an ambiguous access ticket into a least-privilege, time-bound change—without giving the model authority to write directly.
          </p>
          <div className="architecture-cta-row">
            <button className="button button--primary button--large" type="button" onClick={onLaunch}>Open control room <ArrowRight size={18} /></button>
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
          <div><span className="eyebrow"><Network size={14} /> System map</span><h2 id="system-map-title">One workflow. Two trust domains.</h2></div>
          <p>Generative interpretation is separated from deterministic authorization and execution.</p>
        </div>

        <div className="system-map" role="img" aria-label="GrantGuard architecture from request intake through Qwen Cloud, policy control plane, human approval, sandbox IAM, verification and audit store">
          <div className="map-lane map-lane--reasoning">
            <span className="lane-label"><Bot size={14} /> Probabilistic reasoning</span>
            <div className="map-node">
              <span><FileImage size={21} /></span><div><small>01 · Intake</small><strong>Text + screenshot</strong><em>Ambiguous request</em></div>
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
              <span><Wrench size={21} /></span><div><small>03 · Context tools</small><strong>Identity + access</strong><em>Allowlisted reads</em></div>
            </div>
            <ArrowRight className="map-arrow" size={19} />
            <div className="map-node">
              <span><Scale size={21} /></span><div><small>04 · Policy</small><strong>Risk + minimal diff</strong><em>Hard deny wins</em></div>
            </div>
            <ArrowRight className="map-arrow" size={19} />
            <div className="map-node map-node--human">
              <span><UserCheck size={21} /></span><div><small>05 · Human gate</small><strong>Approve / reject</strong><em>No silent writes</em></div>
            </div>
            <ArrowRight className="map-arrow" size={19} />
            <div className="map-node">
              <span><KeyRound size={21} /></span><div><small>06 · IAM sandbox</small><strong>Grant + verify</strong><em>Idempotent action</em></div>
            </div>
          </div>

          <div className="map-sinks">
            <div><Database size={18} /><span><strong>Hash-linked audit</strong><small>Append-only event chain</small></span></div>
            <div><TimerReset size={18} /><span><strong>Auto-revocation</strong><small>Time-bound by default</small></span></div>
            <div><RotateCcw size={18} /><span><strong>Verified rollback</strong><small>Safe recovery path</small></span></div>
          </div>
        </div>
      </section>

      <section className="architecture-section guardrails-section" aria-labelledby="guardrails-title">
        <div className="section-heading section-heading--split">
          <div><span className="eyebrow"><ShieldCheck size={14} /> Safety model</span><h2 id="guardrails-title">Guardrails that change the outcome.</h2></div>
          <p>Not decorative warnings—enforced boundaries in the workflow state machine.</p>
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
          <h2 id="build-story-title">Access tickets are prose.<br />Cloud permissions are code.</h2>
          <p>
            The dangerous gap is the manual translation between them. GrantGuard behaves like a compiler: Qwen builds a typed intermediate representation, policy narrows it, a human authorizes the diff, and deterministic tools execute it.
          </p>
          <ul className="build-principles">
            <li><CheckCircle2 size={16} /><span><strong>Useful ambiguity handling</strong> Vision and language input converge on the same validated schema.</span></li>
            <li><CheckCircle2 size={16} /><span><strong>Production-shaped orchestration</strong> Explicit states, retries, idempotency, verification, rollback, and provider disclosure.</span></li>
            <li><CheckCircle2 size={16} /><span><strong>Auditable intelligence</strong> Structured rationale is shown; private chain-of-thought is never exposed or required.</span></li>
          </ul>
        </div>
        <div className="compiler-stack" aria-label="GrantGuard compiler stages">
          <div><span><Eye size={18} /></span><small>Source</small><strong>Ticket intent</strong><code>text | vision</code></div>
          <div className="compiler-link" />
          <div><span><Braces size={18} /></span><small>IR</small><strong>Validated request</strong><code>AccessRequest</code></div>
          <div className="compiler-link" />
          <div><span><Scale size={18} /></span><small>Optimize</small><strong>Least privilege</strong><code>AccessDiff</code></div>
          <div className="compiler-link" />
          <div><span><KeyRound size={18} /></span><small>Target</small><strong>Temporary grant</strong><code>verified + TTL</code></div>
        </div>
      </section>

      <section className="architecture-footer-cta">
        <span className="cta-grid-mark" aria-hidden="true" />
        <div><span className="eyebrow">Try the full workflow</span><h2>Turn a ticket into a verified decision.</h2></div>
        <button type="button" className="button button--primary button--large" onClick={onLaunch}>Enter control room <ArrowRight size={18} /></button>
      </section>
    </main>
  );
}
