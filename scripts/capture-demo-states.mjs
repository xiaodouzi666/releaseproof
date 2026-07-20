import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173";
const outputDir = path.resolve(process.argv[3] ?? "docs/assets/video/frames");
const width = 1440;
const height = 900;
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9500 + Math.floor(Math.random() * 300);
const profilePath = path.join(os.tmpdir(), `releaseproof-video-${process.pid}-${Date.now()}`);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

await mkdir(outputDir, { recursive: true });

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

async function fetchJson(endpoint, options) {
  const response = await fetch(endpoint, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function waitForDebugger() {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw lastError ?? new Error("Chrome DevTools endpoint did not become ready");
}

try {
  await waitForDebugger();
  const target = await fetchJson(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`,
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
  const waitUntil = async (expression, label, attempts = 120) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (await evaluate(expression)) return;
      await delay(125);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const show = async (selector, align = "center") => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:${JSON.stringify(align)}})`);
    await delay(450);
  };
  const click = async (selector) => {
    await waitUntil(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, selector);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center"})`);
    await delay(150);
    const point = await evaluate(`(() => {
      const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await delay(250);
  };
  const capture = async (name) => {
    const screenshot = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const outputPath = path.join(outputDir, `${name}.png`);
    await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
    console.log(outputPath);
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: baseUrl });
  await waitUntil("document.readyState === 'complete' && Boolean(document.querySelector('[data-testid=\"scenario-picker\"]'))", "ReleaseProof app");
  await evaluate("window.scrollTo(0, 0)");
  await delay(500);
  await capture("01-hero");

  await click('[data-testid="scenario-campaign-vendor-minimized"]');
  await show('[data-testid="run-workflow"]', "center");
  await capture("02-intake");
  await waitUntil("!document.querySelector('[data-testid=\"run-workflow\"]').disabled", "enabled release analysis");
  await click('[data-testid="run-workflow"]');
  await delay(1500);
  console.log(await evaluate("document.body.innerText.slice(-4000)"));
  await waitUntil("Boolean(document.querySelector('[data-testid=\"approve-workflow\"]'))", "owner approval");
  await show('[data-testid="approve-workflow"]', "center");
  await capture("03-minimized-approval");

  await click('[data-testid="approve-workflow"]');
  await waitUntil("Boolean(document.querySelector('[data-testid=\"rollback-workflow\"]')) && !document.querySelector('[data-testid=\"rollback-workflow\"]').disabled", "verified release", 200);
  await show('[data-testid="rollback-workflow"]', "center");
  await capture("04-verified-release");

  await click('[data-testid="rollback-workflow"]');
  await waitUntil("document.body.innerText.includes('Release recalled') || document.body.innerText.includes('recalled')", "verified recall", 200);
  await show('[data-testid="rollback-workflow"]', "center");
  await capture("05-recalled");

  await click('[data-testid="nav-control-room"]');
  await show('[data-testid="scenario-unverified-vendor"]', "center");
  await click('[data-testid="scenario-unverified-vendor"]');
  await show('[data-testid="run-workflow"]', "center");
  await click('[data-testid="run-workflow"]');
  await waitUntil("document.body.innerText.includes('Vendor verification') || document.body.innerText.includes('cannot receive')", "hard denial", 160);
  await show(".workflow-shell", "start");
  await capture("06-hard-denial");

  await click('[data-testid="nav-architecture"]');
  await waitUntil("Boolean(document.querySelector('.system-map'))", "architecture map");
  await show(".system-map", "center");
  await capture("07-architecture");
  socket.close();
} finally {
  chrome.kill();
  await delay(250);
  await rm(profilePath, { recursive: true, force: true }).catch(() => undefined);
}
