import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Capture a real, reproducible ReleaseProof interaction as timestamped browser
 * frames. The companion Python edit keeps the reviewed narration but replaces
 * the old slide backgrounds with these product frames.
 *
 * Usage:
 *   node scripts/capture-dynamic-demo.mjs http://127.0.0.1:8791
 */

const baseUrl = (process.argv[2] ?? "http://127.0.0.1:8791").replace(/\/$/, "");
const outputRoot = path.resolve(process.argv[3] ?? "docs/assets/video/dynamic-frames");
const width = 1920;
const height = 900;
const captureFps = 5;
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9800 + Math.floor(Math.random() * 150);
const profilePath = path.join(os.tmpdir(), `releaseproof-dynamic-video-${process.pid}-${Date.now()}`);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const scenes = [
  { slug: "01-hook", seconds: 18.262 },
  { slug: "02-interpret", seconds: 20.386 },
  { slug: "03-minimize", seconds: 20.981 },
  { slug: "04-authorize", seconds: 22.176 },
  { slug: "05-proof", seconds: 20.766 },
  { slug: "06-deny", seconds: 20.556 },
  { slug: "07-recall", seconds: 19.656 },
  { slug: "08-close", seconds: 19.532 },
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

async function fetchJson(endpoint, options) {
  const response = await fetch(endpoint, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  return payload;
}

async function createWorkflow(scenarioId) {
  const workflow = await fetchJson(`${baseUrl}/api/workflows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `video-${scenarioId}-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({ scenarioId }),
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const current = await fetchJson(`${baseUrl}/api/workflows/${encodeURIComponent(workflow.id)}`);
    if (["awaiting_approval", "denied", "completed", "failed"].includes(current.status)) return current;
    await delay(75);
  }
  throw new Error(`Workflow ${workflow.id} did not reach a reviewable state`);
}

const minimized = await createWorkflow("campaign-vendor-minimized");
if (minimized.status !== "awaiting_approval") {
  throw new Error(`Expected minimized workflow to await approval, got ${minimized.status}`);
}
const denied = await createWorkflow("unverified-vendor");
if (denied.status !== "denied") throw new Error(`Expected denial workflow, got ${denied.status}`);

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profilePath}`,
    `--window-size=${width},${height}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function waitForDebugger() {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw lastError ?? new Error("Chrome DevTools endpoint did not become ready");
}

let approvedWorkflowId = minimized.id;

try {
  await waitForDebugger();
  const target = await fetchJson(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${baseUrl}/`)}`,
    { method: "PUT" },
  );
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let messageId = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++messageId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Browser evaluation failed");
    return result.result?.value;
  };
  const waitUntil = async (expression, label, attempts = 160) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (await evaluate(expression)) return;
      await delay(75);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

  const installPointer = async () => {
    await evaluate(`(() => {
      let style = document.getElementById("releaseproof-video-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "releaseproof-video-style";
        style.textContent = [
          "html{scroll-behavior:auto!important}",
          "*{animation-duration:.35s!important;transition-duration:.35s!important}",
          "#releaseproof-demo-cursor{position:fixed;left:0;top:0;width:28px;height:28px;border:3px solid #a8ff78;border-radius:50%;background:rgba(168,255,120,.12);box-shadow:0 0 0 5px rgba(168,255,120,.12),0 3px 18px rgba(0,0,0,.55);transform:translate(-50%,-50%);z-index:2147483647;pointer-events:none}",
          "#releaseproof-demo-cursor::after{content:'';position:absolute;left:50%;top:50%;width:6px;height:6px;border-radius:50%;background:#f5fff0;transform:translate(-50%,-50%)}",
          "#releaseproof-demo-cursor.click{box-shadow:0 0 0 18px rgba(168,255,120,0),0 3px 18px rgba(0,0,0,.55);background:rgba(168,255,120,.42)}"
        ].join("");
        document.head.append(style);
      }
      let cursor = document.getElementById("releaseproof-demo-cursor");
      if (!cursor) {
        cursor = document.createElement("div");
        cursor.id = "releaseproof-demo-cursor";
        document.body.append(cursor);
      }
      cursor.style.left = "1536px";
      cursor.style.top = "118px";
      return true;
    })()`);
  };

  const navigate = async (url, readyExpression) => {
    await send("Page.navigate", { url });
    await waitUntil(`document.readyState === "complete" && (${readyExpression})`, url);
    await installPointer();
    await delay(250);
  };

  const selectorPoint = async (selector) => evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {x: Math.max(18, Math.min(innerWidth - 18, rect.left + rect.width / 2)), y: Math.max(18, Math.min(innerHeight - 18, rect.top + rect.height / 2))};
  })()`);

  const movePointer = async (x, y, click = false) => {
    await evaluate(`(() => {
      const cursor = document.getElementById("releaseproof-demo-cursor");
      if (!cursor) return;
      cursor.style.left = ${Number(x).toFixed(1)} + "px";
      cursor.style.top = ${Number(y).toFixed(1)} + "px";
      cursor.classList.toggle("click", ${click ? "true" : "false"});
    })()`);
  };

  const clickSelector = async (selector) => {
    const point = await selectorPoint(selector);
    if (!point) throw new Error(`Missing selector ${selector}`);
    await movePointer(point.x, point.y, true);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await delay(160);
    await movePointer(point.x, point.y, false);
  };

  const scrollBounds = async (selector) => evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const absoluteTop = scrollY + rect.top;
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    return {top: Math.max(0, Math.min(max, absoluteTop - Math.max(70, (innerHeight - rect.height) / 2))), max};
  })()`);

  const scrollTo = async (y) => {
    await evaluate(`window.scrollTo(0, ${Math.max(0, Math.round(y))})`);
  };

  const capture = async (directory, index) => {
    const screenshot = await send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 88,
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(path.join(directory, `frame-${String(index).padStart(5, "0")}.jpg`), Buffer.from(screenshot.data, "base64"));
  };

  const recordScene = async (scene, frameAction) => {
    const directory = path.join(outputRoot, scene.slug);
    await mkdir(directory, { recursive: true });
    const frames = Math.max(2, Math.ceil(scene.seconds * captureFps));
    for (let index = 0; index < frames; index += 1) {
      const progress = index / Math.max(1, frames - 1);
      await frameAction(progress, index, frames);
      await capture(directory, index);
    }
    console.log(`${scene.slug}: ${frames} frames`);
    return frames;
  };

  const frameCounts = {};

  // 01: Actual preset selection and Start interaction. The final click creates
  // a real synthetic workflow; subsequent scenes use a pre-created stable run so
  // every required state remains deterministic and readable.
  await navigate(`${baseUrl}/`, `Boolean(document.querySelector('[data-testid="scenario-picker"]'))`);
  const pickerBounds = await scrollBounds('[data-testid="scenario-campaign-vendor-minimized"]');
  let selectedPreset = false;
  let startedPreset = false;
  frameCounts[scenes[0].slug] = await recordScene(scenes[0], async (p) => {
    if (p < 0.23) {
      await scrollTo(0);
      await movePointer(1300 - p * 500, 180 + p * 420);
    } else {
      const local = Math.min(1, (p - 0.23) / 0.34);
      await scrollTo((pickerBounds?.top ?? 650) * local);
      const point = await selectorPoint('[data-testid="scenario-campaign-vendor-minimized"]');
      if (point) await movePointer(point.x, point.y, p > 0.52 && p < 0.56);
      if (!selectedPreset && p >= 0.54) {
        await clickSelector('[data-testid="scenario-campaign-vendor-minimized"]');
        selectedPreset = true;
      }
      if (p > 0.77) {
        const start = await selectorPoint('[data-testid="run-workflow"]');
        if (start) await movePointer(start.x, start.y, p > 0.91);
      }
      if (!startedPreset && p >= 0.92) {
        await clickSelector('[data-testid="run-workflow"]');
        startedPreset = true;
      }
    }
  });

  // 02: Interpret + grounded read-only evidence. This is the same real workflow
  // that will later be approved and recalled.
  await navigate(`${baseUrl}/?workflow=${encodeURIComponent(minimized.id)}`, `Boolean(document.querySelector('.workflow-section'))`);
  await waitUntil(`document.body.innerText.includes("Data owner approval required")`, "approval workflow");
  const summaryBounds = await scrollBounds('.summary-card');
  const timelineBounds = await scrollBounds('.timeline-card');
  frameCounts[scenes[1].slug] = await recordScene(scenes[1], async (p) => {
    const target = p < 0.48 ? (summaryBounds?.top ?? 260) : (timelineBounds?.top ?? 650);
    await scrollTo(target);
    const selector = p < 0.48 ? '.summary-card' : '.timeline-card';
    const point = await selectorPoint(selector);
    if (point) await movePointer(point.x + (p < 0.48 ? 180 : -220), point.y - 110);
  });

  // 03: Requested -> effective field list and 72h -> 8h minimization receipt.
  const minimizationBounds = await scrollBounds('.minimization-receipt');
  const policyBounds = await scrollBounds('.policy-card');
  frameCounts[scenes[2].slug] = await recordScene(scenes[2], async (p) => {
    const start = minimizationBounds?.top ?? 900;
    const end = policyBounds?.top ?? start + 700;
    const eased = p * p * (3 - 2 * p);
    await scrollTo(start + (end - start) * Math.max(0, (eased - 0.48) / 0.52));
    const selector = p < 0.7 ? '.minimization-receipt' : '.policy-card';
    const point = await selectorPoint(selector);
    if (point) await movePointer(point.x + 180, Math.max(140, point.y - 90));
  });

  // 04: Exact human approval, followed by the real sandbox create + read-back.
  const approvalBounds = await scrollBounds('.approval-card');
  await scrollTo(approvalBounds?.top ?? 700);
  let approved = false;
  frameCounts[scenes[3].slug] = await recordScene(scenes[3], async (p) => {
    if (!approved && p < 0.48) {
      const point = await selectorPoint('[data-testid="approve-workflow"]');
      if (point) await movePointer(point.x, point.y, p > 0.38);
    }
    if (!approved && p >= 0.44) {
      await clickSelector('[data-testid="approve-workflow"]');
      approved = true;
      await waitUntil(`document.body.innerText.includes("Release proven") || document.body.innerText.includes("Release complete") || Boolean(document.querySelector('[data-testid="rollback-workflow"]'))`, "verified release", 240);
      await installPointer();
    }
    if (approved) {
      const lifecycle = await scrollBounds('.audit-card');
      await scrollTo(lifecycle?.top ?? 1200);
      const point = await selectorPoint('.audit-card');
      if (point) await movePointer(point.x + 220, point.y - 100);
    }
  });

  // Confirm the browser action really completed the backend workflow.
  const approvedState = await fetchJson(`${baseUrl}/api/workflows/${encodeURIComponent(minimized.id)}`);
  if (approvedState.status !== "completed" || approvedState.verification?.verified !== true) {
    throw new Error(`Approval capture did not produce a verified completion (${approvedState.status})`);
  }
  approvedWorkflowId = approvedState.id;

  // 05: Observed state and hash-linked evidence, including a visibly opened
  // audit-proof disclosure from the real event stream.
  await navigate(`${baseUrl}/?workflow=${encodeURIComponent(approvedWorkflowId)}`, `Boolean(document.querySelector('.audit-card'))`);
  const lifecycleBounds = await scrollBounds('.audit-card');
  const proofTimelineBounds = await scrollBounds('.timeline-card');
  let openedProof = false;
  frameCounts[scenes[4].slug] = await recordScene(scenes[4], async (p) => {
    if (p < 0.5) {
      await scrollTo(lifecycleBounds?.top ?? 1200);
      const point = await selectorPoint('.audit-card');
      if (point) await movePointer(point.x, point.y - 80);
    } else {
      await scrollTo(proofTimelineBounds?.top ?? 700);
      if (!openedProof) {
        const first = await evaluate(`(() => {
          const items = [...document.querySelectorAll('.timeline-audit-proof')];
          const item = items.find((candidate) => candidate.getBoundingClientRect().top > 90 && candidate.getBoundingClientRect().top < innerHeight - 100) || items[0];
          if (!item) return false;
          item.open = true;
          item.scrollIntoView({block:'center'});
          return true;
        })()`);
        openedProof = Boolean(first);
      }
      const point = await selectorPoint('.timeline-audit-proof[open]');
      if (point) await movePointer(point.x + 180, point.y);
    }
  });

  // 06: A separate real hard-deny run. No approval or write control is present.
  await navigate(`${baseUrl}/?workflow=${encodeURIComponent(denied.id)}`, `Boolean(document.querySelector('.workflow-section'))`);
  await waitUntil(`document.body.innerText.includes("Release denied") || document.body.innerText.includes("Policy denied this release")`, "denied workflow");
  const denyTop = await scrollBounds('.risk-card');
  const denyGate = await scrollBounds('.approval-card');
  const denyPolicy = await scrollBounds('.policy-card');
  frameCounts[scenes[5].slug] = await recordScene(scenes[5], async (p) => {
    const target = p < 0.34 ? (denyTop?.top ?? 250) : p < 0.7 ? (denyGate?.top ?? 700) : (denyPolicy?.top ?? 1200);
    await scrollTo(target);
    const selector = p < 0.34 ? '.risk-card' : p < 0.7 ? '.approval-card' : '.policy-card';
    const point = await selectorPoint(selector);
    if (point) await movePointer(point.x + 190, Math.max(140, point.y - 80));
  });

  // 07: Return to the exact verified share, click Recall, and show observed
  // inactive state. This is not a staged screenshot; the UI action mutates the
  // same sandbox share created in scene 04.
  await navigate(`${baseUrl}/?workflow=${encodeURIComponent(approvedWorkflowId)}`, `Boolean(document.querySelector('[data-testid="rollback-workflow"]'))`);
  const recallBounds = await scrollBounds('.audit-card');
  await scrollTo(recallBounds?.top ?? 1200);
  let recalled = false;
  frameCounts[scenes[6].slug] = await recordScene(scenes[6], async (p) => {
    if (!recalled) {
      const point = await selectorPoint('[data-testid="rollback-workflow"]');
      if (point) await movePointer(point.x, point.y, p > 0.36);
    }
    if (!recalled && p >= 0.42) {
      await clickSelector('[data-testid="rollback-workflow"]');
      recalled = true;
      await waitUntil(`document.body.innerText.includes("Release recalled") || document.body.innerText.includes("Recall observed and proven")`, "verified recall", 240);
      await installPointer();
      const updatedBounds = await scrollBounds('.audit-card');
      await scrollTo(updatedBounds?.top ?? 1200);
    }
    const point = await selectorPoint('.audit-card');
    if (point && recalled) await movePointer(point.x + 260, point.y + 30);
  });

  const recalledState = await fetchJson(`${baseUrl}/api/workflows/${encodeURIComponent(approvedWorkflowId)}`);
  if (recalledState.status !== "rolled_back" || recalledState.rollbackVerification?.verified !== true) {
    throw new Error(`Recall capture did not produce verified rollback (${recalledState.status})`);
  }

  // 08: Actual architecture navigation and the model/policy/tool boundary.
  // Use the same React click handler directly here: after the long workflow
  // document the sticky header can be outside CDP's visual hit-test viewport,
  // even though the control remains present and accessible.
  await evaluate(`document.querySelector('[data-testid="nav-architecture"]')?.click()`);
  await waitUntil(`Boolean(document.querySelector('.system-map'))`, "architecture map");
  await installPointer();
  const mapBounds = await scrollBounds('.system-map');
  const boundaryBounds = await scrollBounds('.boundary-grid');
  frameCounts[scenes[7].slug] = await recordScene(scenes[7], async (p) => {
    const start = mapBounds?.top ?? 160;
    const end = boundaryBounds?.top ?? start + 720;
    const target = p < 0.62 ? start : start + (end - start) * ((p - 0.62) / 0.38);
    await scrollTo(target);
    const selector = p < 0.62 ? '.system-map' : '.boundary-grid';
    const point = await selectorPoint(selector);
    if (point) await movePointer(point.x + 220, Math.max(135, point.y - 100));
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    captureFps,
    width,
    height,
    dataBoundary: "Synthetic preset scenarios and sandbox clean-room adapter only",
    providerClaim: "Recorded Demo; no successful live-Qwen inference claimed",
    minimizedWorkflowId: approvedWorkflowId,
    deniedWorkflowId: denied.id,
    minimizedFinalStatus: recalledState.status,
    minimizedReleaseVerified: approvedState.verification?.verified === true,
    minimizedRecallVerified: recalledState.rollbackVerification?.verified === true,
    deniedFinalStatus: denied.status,
    scenes: scenes.map((scene) => ({ ...scene, frames: frameCounts[scene.slug] })),
  };
  await writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(manifest, null, 2));
  socket.close();
} finally {
  chrome.kill();
  await delay(250);
  await rm(profilePath, { recursive: true, force: true }).catch(() => undefined);
}
