import "dotenv/config";
import { createServer } from "node:http";

// Load server-only .env values before importing the workflow modules, whose
// Qwen defaults are resolved at module initialization time.
const { createApp } = await import("./app.js");

const port = Math.max(1, Math.min(65_535, Number(process.env.PORT ?? 8787)));
const host = process.env.HOST ?? "0.0.0.0";
const app = await createApp();
const server = createServer(app);

server.listen(port, host, () => {
  console.log(`ReleaseProof API listening on http://${host}:${port}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received; draining ReleaseProof API connections`);
  server.close((error) => {
    if (error) {
      console.error("Graceful shutdown failed", error);
      process.exitCode = 1;
    }
  });
  setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
