import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app.js";

const previousAuditStore = process.env.AUDIT_STORE;
const previousDataFile = process.env.GRANTGUARD_DATA_FILE;
const previousReleaseProofDataFile = process.env.RELEASEPROOF_DATA_FILE;

afterEach(() => {
  if (previousAuditStore === undefined) delete process.env.AUDIT_STORE;
  else process.env.AUDIT_STORE = previousAuditStore;
  if (previousDataFile === undefined) delete process.env.GRANTGUARD_DATA_FILE;
  else process.env.GRANTGUARD_DATA_FILE = previousDataFile;
  if (previousReleaseProofDataFile === undefined) delete process.env.RELEASEPROOF_DATA_FILE;
  else process.env.RELEASEPROOF_DATA_FILE = previousReleaseProofDataFile;
  vi.restoreAllMocks();
});

describe("audit-store health", () => {
  it("reports degraded without leaking paths and blocks mutations when file persistence is unavailable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "releaseproof-unwritable-store-"));
    process.env.AUDIT_STORE = "file";
    // Passing a directory as the data file makes initialization fail on every platform.
    process.env.RELEASEPROOF_DATA_FILE = directory;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const app = await createApp();
      const health = await request(app).get("/api/health").expect(503);

      expect(health.body).toMatchObject({
        status: "degraded",
        store: {
          mode: "memory",
          healthy: false,
          detail: "File persistence unavailable; writes disabled",
        },
      });
      expect(JSON.stringify(health.body)).not.toContain(directory);

      const mutation = await request(app)
        .post("/api/workflows")
        .send({ scenarioId: "existing-aggregate-share" })
        .expect(503);
      expect(mutation.body.error.code).toBe("STORE_UNAVAILABLE");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
