import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Workflow } from "../shared/contracts.js";
import { createApp } from "../server/app.js";
import { WorkflowStore } from "../server/store.js";

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
  it("does not expose an in-memory mutation until its file persistence settles", async () => {
    const directory = await mkdtemp(join(tmpdir(), "releaseproof-store-visibility-"));
    process.env.AUDIT_STORE = "file";
    process.env.RELEASEPROOF_DATA_FILE = join(directory, "store.json");

    const store = await WorkflowStore.create();
    const internals = store as unknown as { persistFile: () => Promise<void> };
    const originalPersistFile = internals.persistFile;
    let persistenceEntered!: () => void;
    let releasePersistence!: () => void;
    const entered = new Promise<void>((resolve) => {
      persistenceEntered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    internals.persistFile = async () => {
      persistenceEntered();
      await gate;
      await originalPersistFile.call(store);
    };

    const now = new Date().toISOString();
    const workflow: Workflow = {
      id: "wf_visibility_test",
      requestText: "Share aggregate campaign data with the verified processor for eight hours.",
      status: "queued",
      hasImage: false,
      createdAt: now,
      updatedAt: now,
      currentAccess: [],
      toolTraces: [],
      events: [],
      model: {
        mode: "recorded-demo",
        provider: "deterministic fixture",
        model: "recorded-demo-fixtures-v1",
        fallbackUsed: false,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        disclosure: "Persistence visibility regression fixture.",
      },
    };

    let create: ReturnType<typeof store.createWorkflow> | undefined;
    let released = false;
    try {
      create = store.createWorkflow(workflow, "visibility-test");
      await entered;

      const settled = { get: false, find: false, list: false };
      const get = store.getWorkflow(workflow.id).then((value) => {
        settled.get = true;
        return value;
      });
      const find = store.findByIdempotencyKey("visibility-test").then((value) => {
        settled.find = true;
        return value;
      });
      const list = store.listWorkflows().then((value) => {
        settled.list = true;
        return value;
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toEqual({ get: false, find: false, list: false });

      releasePersistence();
      released = true;
      await create;
      const [byId, byKey, workflows] = await Promise.all([get, find, list]);
      expect(byId?.id).toBe(workflow.id);
      expect(byKey?.id).toBe(workflow.id);
      expect(workflows.map((item) => item.id)).toContain(workflow.id);
    } finally {
      if (!released) releasePersistence();
      await create?.catch(() => undefined);
      internals.persistFile = originalPersistFile;
      await rm(directory, { recursive: true, force: true });
    }
  });

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
