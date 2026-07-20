import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";

process.env.AUDIT_STORE = "memory";
process.env.DEMO_STEP_DELAY_MS = "0";
delete process.env.DASHSCOPE_API_KEY;

describe("public request integrity", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  const originalCors = process.env.CORS_ORIGINS;
  const originalCreateLimit = process.env.WORKFLOW_CREATE_LIMIT_PER_MINUTE;

  beforeAll(async () => {
    delete process.env.CORS_ORIGINS;
    app = await createApp();
  });

  afterEach(() => {
    if (originalCors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = originalCors;
    if (originalCreateLimit === undefined) delete process.env.WORKFLOW_CREATE_LIMIT_PER_MINUTE;
    else process.env.WORKFLOW_CREATE_LIMIT_PER_MINUTE = originalCreateLimit;
  });

  it("rejects edited text or imagery attached to a locked preset", async () => {
    const edited = await request(app)
      .post("/api/workflows")
      .send({ scenarioId: "developer-staging-deploy", requestText: "This is completely different custom request text." })
      .expect(400);
    expect(edited.body.error.code).toBe("SCENARIO_OVERRIDE_NOT_ALLOWED");

    const imaged = await request(app)
      .post("/api/workflows")
      .send({ scenarioId: "developer-staging-deploy", imageDataUrl: "data:image/png;base64,aA==" })
      .expect(400);
    expect(imaged.body.error.code).toBe("SCENARIO_OVERRIDE_NOT_ALLOWED");
  });

  it("does not enable cross-origin reads by default", async () => {
    const response = await request(app)
      .get("/api/health")
      .set("Origin", "https://untrusted.example")
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows only an explicitly configured browser origin", async () => {
    process.env.CORS_ORIGINS = "https://judge.example";
    const corsApp = await createApp();

    const allowed = await request(corsApp)
      .get("/api/health")
      .set("Origin", "https://judge.example")
      .expect(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://judge.example");

    const denied = await request(corsApp)
      .get("/api/health")
      .set("Origin", "https://untrusted.example")
      .expect(200);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("does not expose a workflow-deletion endpoint", async () => {
    await request(app).delete("/api/workflows/nonexistent").expect(404);
  });

  it("does not expose a cross-visitor workflow listing", async () => {
    await request(app).get("/api/workflows").expect(404);
  });

  it("marks workflow state responses as non-cacheable", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .send({ scenarioId: "developer-staging-deploy" })
      .expect(202);
    expect(created.headers["cache-control"]).toBe("no-store");

    const fetched = await request(app).get(`/api/workflows/${created.body.id}`).expect(200);
    expect(fetched.headers["cache-control"]).toBe("no-store");
  });

  it("requires JSON and an explicit approver on state-changing actions", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .send({ scenarioId: "developer-staging-deploy" })
      .expect(202);

    await request(app)
      .post(`/api/workflows/${created.body.id}/approve`)
      .type("form")
      .send({ approver: "Cross-site form" })
      .expect(415);

    const missingApprover = await request(app)
      .post(`/api/workflows/${created.body.id}/approve`)
      .send({})
      .expect(400);
    expect(missingApprover.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("bounds public workflow creation and returns a retry hint", async () => {
    process.env.WORKFLOW_CREATE_LIMIT_PER_MINUTE = "2";
    const limitedApp = await createApp();

    await request(limitedApp).post("/api/workflows").send({ scenarioId: "developer-staging-deploy" }).expect(202);
    await request(limitedApp).post("/api/workflows").send({ scenarioId: "developer-staging-deploy" }).expect(202);
    const limited = await request(limitedApp)
      .post("/api/workflows")
      .send({ scenarioId: "developer-staging-deploy" })
      .expect(429);

    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("does not let invalid submissions consume the valid-workflow budget", async () => {
    process.env.WORKFLOW_CREATE_LIMIT_PER_MINUTE = "1";
    const limitedApp = await createApp();

    await request(limitedApp).post("/api/workflows").send({ requestText: "short" }).expect(400);
    await request(limitedApp)
      .post("/api/workflows")
      .send({ scenarioId: "developer-staging-deploy" })
      .expect(202);
    await request(limitedApp)
      .post("/api/workflows")
      .send({ scenarioId: "developer-staging-deploy" })
      .expect(429);
  });
});
