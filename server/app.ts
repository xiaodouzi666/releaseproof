import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import cors from "cors";
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import type { ApiErrorBody, HealthResponse } from "../shared/contracts.js";
import { runEvaluation } from "./evaluation.js";
import { findScenario, scenarios } from "./scenarios.js";
import { StoreNotFoundError, StoreUnavailableError } from "./store.js";
import { WorkflowConflictError, WorkflowService } from "./workflow-service.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const createSchema = z
  .object({
    requestText: z.preprocess(
      (value) => (typeof value === "string" && !value.trim() ? undefined : value),
      z.string().trim().min(10).max(20_000).optional(),
    ),
    scenarioId: z.string().trim().min(1).max(100).optional(),
    imageDataUrl: z
      .string()
      .max(8_000_000)
      .regex(/^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/, "Expected a PNG, JPEG, or WebP data URL")
      .optional(),
  })
  .refine((value) => Boolean(value.requestText || value.scenarioId || value.imageDataUrl), {
    message: "Provide requestText, scenarioId, or imageDataUrl",
  });

const actionSchema = z.object({
  approver: z.string().trim().min(2).max(120),
  note: z.string().trim().max(1_000).optional(),
});

function requireJson(request: Request, _response: Response, next: NextFunction): void {
  if (!request.is(["application/json", "application/*+json"])) {
    next(new UnsupportedMediaTypeError());
    return;
  }
  next();
}

function idempotencyKey(request: Request): string | undefined {
  const value = request.header("Idempotency-Key")?.trim();
  if (!value) return undefined;
  if (value.length > 200) throw new ClientInputError("IDEMPOTENCY_KEY_TOO_LONG", "Idempotency-Key must be at most 200 characters");
  return value;
}

function sendSse(response: Response, event: string, data: unknown, id?: string): void {
  if (id) response.write(`id: ${id}\n`);
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function createApp(service?: WorkflowService): Promise<express.Express> {
  const workflows = service ?? (await WorkflowService.create());
  const app = express();
  const workflowCreateLimit = Math.max(
    1,
    Math.min(1_000, Number(process.env.WORKFLOW_CREATE_LIMIT_PER_MINUTE ?? 12) || 12),
  );
  let workflowCreateWindowStartedAt = Date.now();
  let workflowCreateCount = 0;
  app.disable("x-powered-by");
  const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configuredOrigins.length) {
    app.use(cors({
      origin: configuredOrigins.length ? configuredOrigins : true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Idempotency-Key", "Last-Event-ID"],
      exposedHeaders: ["X-Request-Id", "Location"],
    }));
  }
  app.use(express.json({ limit: "9mb", type: ["application/json", "application/*+json"] }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    request.requestId = request.header("X-Request-Id")?.slice(0, 100) || randomUUID();
    response.setHeader("X-Request-Id", request.requestId);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  app.get("/api/health", (_request, response) => {
    const model = workflows.qwen.metadata();
    const store = workflows.store.health();
    const body: HealthResponse = {
      status: store.healthy ? "ok" : "degraded",
      service: "grantguard-api",
      version: "0.1.0",
      deploymentTarget: process.env.DEPLOYMENT_TARGET ?? "local",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      model: {
        mode: model.mode,
        provider: model.provider,
        model: model.model,
        disclosure: model.disclosure,
      },
      store,
    };
    response.status(store.healthy ? 200 : 503).json(body);
  });

  app.get("/api/scenarios", (_request, response) => response.json(scenarios));
  app.get("/api/metrics", async (_request, response) => response.json(await workflows.metrics()));
  app.get("/api/evaluation", (_request, response) => response.json(runEvaluation()));

  app.use("/api/workflows", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  app.post("/api/workflows", requireJson, async (request, response) => {
    const parsed = createSchema.parse(request.body);
    const scenario = findScenario(parsed.scenarioId);
    if (parsed.scenarioId && !scenario) {
      throw new ClientInputError("SCENARIO_NOT_FOUND", `Unknown scenario ${parsed.scenarioId}`);
    }
    if (
      scenario &&
      (parsed.imageDataUrl || (parsed.requestText !== undefined && parsed.requestText !== scenario.requestText))
    ) {
      throw new ClientInputError(
        "SCENARIO_OVERRIDE_NOT_ALLOWED",
        "A preset scenario cannot be combined with edited text or an image; omit scenarioId for a custom request",
      );
    }
    const requestText =
      parsed.requestText ??
      scenario?.requestText ??
      (parsed.imageDataUrl
        ? "Image-only access request submitted for secure structured extraction."
        : undefined);
    if (!requestText) {
      throw new ClientInputError("REQUEST_TEXT_REQUIRED", "requestText is required unless a valid scenarioId is supplied");
    }
    const now = Date.now();
    if (now - workflowCreateWindowStartedAt >= 60_000) {
      workflowCreateWindowStartedAt = now;
      workflowCreateCount = 0;
    }
    if (workflowCreateCount >= workflowCreateLimit) {
      throw new RateLimitError(Math.max(1, Math.ceil((60_000 - (now - workflowCreateWindowStartedAt)) / 1_000)));
    }
    workflowCreateCount += 1;
    const workflow = await workflows.createWorkflow(
      { requestText, scenarioId: parsed.scenarioId, imageDataUrl: parsed.imageDataUrl },
      idempotencyKey(request),
    );
    response.status(202).location(`/api/workflows/${workflow.id}`).json(workflow);
  });

  app.get("/api/workflows/:id", async (request, response) => {
    response.json(await workflows.getWorkflow(request.params.id));
  });

  app.get("/api/workflows/:id/events", async (request, response) => {
    let initial = await workflows.getWorkflow(request.params.id);
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-store, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    response.write("retry: 1500\n\n");

    const suppliedLastId = request.header("Last-Event-ID")?.trim();
    let lastSequence = suppliedLastId
      ? (initial.events.find((event) => event.id === suppliedLastId)?.sequence ?? Number(suppliedLastId)) || 0
      : 0;
    let ready = false;
    const buffered: Array<{ event: (typeof initial.events)[number]; workflow: typeof initial }> = [];
    const unsubscribe = workflows.subscribe(initial.id, (event, snapshot) => {
      if (!ready) buffered.push({ event, workflow: snapshot });
      else if (event.sequence > lastSequence) {
        sendSse(response, "audit", event, event.id);
        lastSequence = event.sequence;
      }
    });

    initial = await workflows.getWorkflow(initial.id);
    sendSse(response, "snapshot", initial);
    for (const event of initial.events) {
      if (event.sequence > lastSequence) {
        sendSse(response, "audit", event, event.id);
        lastSequence = event.sequence;
      }
    }
    ready = true;
    for (const item of buffered) {
      if (item.event.sequence > lastSequence) {
        sendSse(response, "audit", item.event, item.event.id);
        lastSequence = item.event.sequence;
      }
    }

    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
    heartbeat.unref();
    request.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  });

  app.post("/api/workflows/:id/approve", requireJson, async (request, response) => {
    const body = actionSchema.parse(request.body);
    const workflow = await workflows.approve(
      String(request.params.id),
      body.approver,
      body.note,
      idempotencyKey(request),
    );
    response.status(202).json(workflow);
  });

  app.post("/api/workflows/:id/reject", requireJson, async (request, response) => {
    const body = actionSchema.parse(request.body);
    response.json(
      await workflows.reject(
        String(request.params.id),
        body.approver,
        body.note,
        idempotencyKey(request),
      ),
    );
  });

  app.post("/api/workflows/:id/rollback", requireJson, async (request, response) => {
    const body = actionSchema.parse(request.body);
    const workflow = await workflows.rollback(
      String(request.params.id),
      body.approver,
      body.note,
      idempotencyKey(request),
    );
    response.status(202).json(workflow);
  });

  const distDirectory = join(process.cwd(), "dist");
  const spaEntry = join(distDirectory, "index.html");
  if (process.env.NODE_ENV === "production" && existsSync(spaEntry)) {
    app.use(express.static(distDirectory, { index: false, fallthrough: true, dotfiles: "deny", maxAge: "1h" }));
    app.use((request, response, next) => {
      if (request.method === "GET" && !request.path.startsWith("/api/")) {
        response.setHeader("Cache-Control", "no-cache");
        response.sendFile(spaEntry);
        return;
      }
      next();
    });
  }

  app.use((request, _response, next) => {
    next(new HttpNotFoundError(request.method, request.path));
  });

  const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "GrantGuard could not complete this request";
    let details: unknown;

    if (error instanceof ZodError) {
      status = 400;
      code = "VALIDATION_ERROR";
      message = "The request body is invalid";
      details = error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    } else if (error instanceof ClientInputError) {
      status = 400;
      code = error.code;
      message = error.message;
    } else if (error instanceof StoreNotFoundError || error instanceof HttpNotFoundError) {
      status = 404;
      code = "NOT_FOUND";
      message = error.message;
    } else if (error instanceof StoreUnavailableError) {
      status = 503;
      code = "STORE_UNAVAILABLE";
      message = error.message;
    } else if (error instanceof RateLimitError) {
      status = 429;
      code = "RATE_LIMITED";
      message = error.message;
      response.setHeader("Retry-After", String(error.retryAfterSeconds));
    } else if (error instanceof UnsupportedMediaTypeError) {
      status = 415;
      code = "UNSUPPORTED_MEDIA_TYPE";
      message = error.message;
    } else if (error instanceof WorkflowConflictError) {
      status = 409;
      code = "WORKFLOW_CONFLICT";
      message = error.message;
      details = { currentStatus: error.currentStatus };
    } else if ((error as { type?: string }).type === "entity.too.large") {
      status = 413;
      code = "PAYLOAD_TOO_LARGE";
      message = "Request body exceeds the 9 MB limit";
    } else if (error instanceof SyntaxError && "body" in error) {
      status = 400;
      code = "INVALID_JSON";
      message = "Request body must be valid JSON";
    }

    if (status >= 500) {
      console.error(`[${request.requestId}]`, error);
    }
    const body: ApiErrorBody = { error: { code, message, requestId: request.requestId, ...(details ? { details } : {}) } };
    response.status(status).json(body);
  };
  app.use(errorHandler);

  return app;
}

class ClientInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ClientInputError";
  }
}

class HttpNotFoundError extends Error {
  constructor(method: string, path: string) {
    super(`No route for ${method} ${path}`);
    this.name = "HttpNotFoundError";
  }
}

class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Workflow creation rate limit reached; retry after the current window");
    this.name = "RateLimitError";
  }
}

class UnsupportedMediaTypeError extends Error {
  constructor() {
    super("State-changing requests must use an application/json content type");
    this.name = "UnsupportedMediaTypeError";
  }
}
