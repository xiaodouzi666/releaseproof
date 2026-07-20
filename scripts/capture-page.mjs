import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const [url, outputPath, widthArg = "1440", heightArg = "1600", scrollYArg = "0"] = process.argv.slice(2);

if (!url || !outputPath) {
  console.error("Usage: node scripts/capture-page.mjs <url> <output.png> [width] [height] [scrollY]");
  process.exit(1);
}

const width = Number.parseInt(widthArg, 10);
const height = Number.parseInt(heightArg, 10);
const scrollY = Number.parseInt(scrollYArg, 10);
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9300 + Math.floor(Math.random() * 500);
const profilePath = path.join(os.tmpdir(), `releaseproof-capture-${process.pid}-${Date.now()}`);

await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });

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

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
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

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await delay(100);
    const result = await send("Runtime.evaluate", {
      expression:
        "document.readyState === 'complete' && !(document.body?.textContent ?? document.documentElement.textContent ?? '').includes('Loading request')",
      returnByValue: true,
    });
    if (result.result?.value === true) {
      ready = true;
      break;
    }
  }

  if (!ready) throw new Error("Page did not settle before screenshot capture");
  if (scrollY > 0) {
    await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${scrollY})` });
  }
  await delay(500);

  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path.resolve(outputPath), Buffer.from(screenshot.data, "base64"));
  socket.close();
  console.log(path.resolve(outputPath));
} finally {
  chrome.kill();
  await delay(250);
  await rm(profilePath, { recursive: true, force: true }).catch(() => undefined);
}
