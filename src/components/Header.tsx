import { Menu, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { HealthInfo, ViewName, WorkflowMetadata } from "../types";
import { ProviderBadge } from "./ProviderBadge";

interface HeaderProps {
  view: ViewName;
  onViewChange: (view: ViewName) => void;
  health?: HealthInfo;
  metadata?: WorkflowMetadata;
  healthLoading: boolean;
  healthFailed: boolean;
}

export function Header({ view, onViewChange, health, metadata, healthLoading, healthFailed }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const chooseView = (next: ViewName) => {
    onViewChange(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="brand" type="button" onClick={() => chooseView("workspace")} aria-label="ReleaseProof home">
          <span className="brand-mark" aria-hidden="true">
            <ShieldCheck size={24} strokeWidth={1.8} />
          </span>
          <span className="brand-wordmark">
            <strong>ReleaseProof</strong>
            <small>Data Release Autopilot</small>
          </span>
        </button>

        <nav className={`primary-nav ${menuOpen ? "primary-nav--open" : ""}`} aria-label="Primary navigation">
          <button
            type="button"
            className={view === "workspace" ? "is-active" : ""}
            data-testid="nav-control-room"
            onClick={() => chooseView("workspace")}
            aria-current={view === "workspace" ? "page" : undefined}
          >
            Release room
          </button>
          <button
            type="button"
            className={view === "architecture" ? "is-active" : ""}
            data-testid="nav-architecture"
            onClick={() => chooseView("architecture")}
            aria-current={view === "architecture" ? "page" : undefined}
          >
            How it works
          </button>
          <div className="mobile-provider">
            <ProviderBadge health={health} metadata={metadata} loading={healthLoading} failed={healthFailed} />
          </div>
        </nav>

        <div className="header-runtime">
          <ProviderBadge health={health} metadata={metadata} loading={healthLoading} failed={healthFailed} />
        </div>

        <button
          type="button"
          className="menu-button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>
  );
}
