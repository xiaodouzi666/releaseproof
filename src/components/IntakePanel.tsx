import {
  AlertTriangle,
  ArrowRight,
  FileImage,
  ImagePlus,
  LoaderCircle,
  ScanLine,
  Sparkles,
  X,
} from "lucide-react";
import { useRef } from "react";
import { releaseLanguage } from "../format";
import type { Scenario } from "../types";

interface IntakePanelProps {
  scenarios: Scenario[];
  scenariosLoading: boolean;
  scenariosError?: string;
  selectedScenarioId?: string;
  requestText: string;
  imageDataUrl?: string;
  imageName?: string;
  submitting: boolean;
  error?: string;
  onScenarioChange: (scenario: Scenario) => void;
  onRequestTextChange: (value: string) => void;
  onImageChange: (file?: File) => void;
  onLoadSample: () => void;
  onSubmit: () => void;
}

const scenarioNumber = (index: number) => String(index + 1).padStart(2, "0");

export function IntakePanel({
  scenarios,
  scenariosLoading,
  scenariosError,
  selectedScenarioId,
  requestText,
  imageDataUrl,
  imageName,
  submitting,
  error,
  onScenarioChange,
  onRequestTextChange,
  onImageChange,
  onLoadSample,
  onSubmit,
}: IntakePanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canSubmit = Boolean(requestText.trim() || imageDataUrl) && !submitting;

  return (
    <section className="intake-section" id="request-intake" aria-labelledby="intake-heading">
      <div className="section-heading section-heading--split">
        <div>
          <span className="eyebrow"><ScanLine size={14} /> Release intake</span>
          <h2 id="intake-heading">Give the autopilot the messy brief.</h2>
        </div>
        <p>Vendor email, campaign brief, or screenshot. Qwen interprets it; code controls the exact dataset that may leave.</p>
      </div>

      <div className="scenario-block">
        <div className="field-label-row">
          <label id="scenario-label">Choose a release walkthrough</label>
          <span>Optional · loads a synthetic vendor request</span>
        </div>
        {scenariosLoading ? (
          <div className="scenario-grid" aria-label="Loading scenarios">
            {[0, 1, 2].map((item) => <div className="scenario-card skeleton-card" key={item} />)}
          </div>
        ) : scenariosError ? (
          <div className="inline-notice inline-notice--warning"><AlertTriangle size={16} /> {releaseLanguage(scenariosError)}</div>
        ) : scenarios.length ? (
          <div className="scenario-grid" role="radiogroup" aria-labelledby="scenario-label" data-testid="scenario-picker">
            {scenarios.map((scenario, index) => {
              const selected = scenario.id === selectedScenarioId;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`scenario-card ${selected ? "scenario-card--selected" : ""}`}
                  data-testid={`scenario-${scenario.id}`}
                  key={scenario.id}
                  onClick={() => onScenarioChange(scenario)}
                >
                  <span className="scenario-index">{scenarioNumber(index)}</span>
                  <span className="scenario-copy">
                    <strong>{releaseLanguage(scenario.name)}</strong>
                    <small>{releaseLanguage(scenario.description)}</small>
                  </span>
                  <span className="scenario-tag">{releaseLanguage(scenario.riskHint || scenario.tag || "guided")}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="inline-notice">No release walkthroughs returned. You can still enter a vendor request below.</div>
        )}
      </div>

      <div className="intake-grid">
        <div className="request-editor">
          <div className="field-label-row">
            <label htmlFor="request-text">Data release request</label>
            <span>{requestText.length.toLocaleString()} characters</span>
          </div>
          <textarea
            id="request-text"
            value={requestText}
            onChange={(event) => onRequestTextChange(event.target.value)}
            placeholder="Example: DPA-203 — Share campaign-performance with analyst@northstar.example for 8 hours using aggregate.read and profile.read for Q3 lift analysis."
            maxLength={6000}
            rows={9}
          />
          <div className="editor-footnote">
            <Sparkles size={14} aria-hidden="true" />
            Qwen extracts recipient, purpose, fields, and duration; deterministic release policy remains authoritative.
          </div>
        </div>

        <div className="image-uploader">
          <div className="field-label-row">
            <label htmlFor="ticket-image">Brief or contract screenshot</label>
            <span>PNG, JPG or WEBP · max 4 MB</span>
          </div>
          <input
            ref={fileRef}
            className="sr-only"
            id="ticket-image"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => onImageChange(event.target.files?.[0])}
          />
          {imageDataUrl ? (
            <div className="upload-preview">
              <img src={imageDataUrl} alt={`Preview of ${imageName || "uploaded release evidence"}`} />
              <div className="upload-preview-overlay">
                <FileImage size={17} />
                <span>{imageName}</span>
              </div>
              <button type="button" onClick={() => { onImageChange(undefined); if (fileRef.current) fileRef.current.value = ""; }} aria-label="Remove uploaded image">
                <X size={17} />
              </button>
            </div>
          ) : (
            <div className="upload-empty-state">
              <button type="button" className="upload-dropzone" onClick={() => fileRef.current?.click()}>
                <span className="upload-icon"><ImagePlus size={25} /></span>
                <strong>Add visual context</strong>
                <small>Live Qwen vision can read the original brief or contract without a separate OCR service.</small>
                <span className="upload-action">Browse image</span>
              </button>
              <button type="button" className="sample-image-button" data-testid="load-sample-image" onClick={onLoadSample}>
                <FileImage size={14} /> Load adversarial release sample
              </button>
              <p className="sample-disclosure">Recorded Demo does not inspect image pixels; this button also fills matching release text for a deterministic safety run. Live Qwen vision reads the image.</p>
            </div>
          )}
        </div>
      </div>

      {error ? <div className="form-error" role="alert"><AlertTriangle size={17} /> {releaseLanguage(error)}</div> : null}

      <div className="intake-actions">
        <div className="privacy-note">
          <span className="privacy-orb" />
          Synthetic data only. Never paste real customer records, secrets, or credentials.
        </div>
        <button className="button button--primary button--large" data-testid="run-workflow" type="button" disabled={!canSubmit} onClick={onSubmit}>
          {submitting ? <><LoaderCircle className="spin" size={18} /> Building manifest</> : <>Start release analysis <ArrowRight size={18} /></>}
        </button>
      </div>
    </section>
  );
}
