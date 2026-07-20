import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Workflow } from "../shared/contracts.js";

interface PersistedState {
  version: 1;
  workflows: Record<string, Workflow>;
  idempotency: Record<string, string>;
}

export interface StoreHealth {
  mode: "file" | "memory";
  healthy: boolean;
  detail?: string;
}

function emptyState(): PersistedState {
  return { version: 1, workflows: {}, idempotency: {} };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class WorkflowStore {
  private state: PersistedState = emptyState();
  private writeChain: Promise<void> = Promise.resolve();
  private mode: "file" | "memory" = "memory";
  private healthy = true;
  private detail = "Memory store requested";

  private constructor(private readonly filePath: string | null) {}

  static async create(): Promise<WorkflowStore> {
    const requested = (process.env.AUDIT_STORE ?? "file").toLowerCase();
    const filePath =
      requested === "memory"
        ? null
        : process.env.RELEASEPROOF_DATA_FILE ??
          process.env.GRANTGUARD_DATA_FILE ??
          join(process.cwd(), "data", "releaseproof-store.json");
    const store = new WorkflowStore(filePath);
    await store.initialize();
    return store;
  }

  private async initialize(): Promise<void> {
    if (!this.filePath) return;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      try {
        const raw = await readFile(this.filePath, "utf8");
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        if (parsed.version !== 1 || !parsed.workflows || !parsed.idempotency) {
          throw new Error("Unsupported or malformed ReleaseProof store");
        }
        this.state = parsed as PersistedState;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await this.persistFile();
      }
      this.mode = "file";
      this.healthy = true;
      this.detail = "File persistence active";
    } catch (error) {
      this.mode = "memory";
      this.healthy = false;
      this.detail = "File persistence unavailable; writes disabled";
      console.error("ReleaseProof file store initialization failed", error);
    }
  }

  health(): StoreHealth {
    return { mode: this.mode, healthy: this.healthy, detail: this.detail };
  }

  async createWorkflow(workflow: Workflow, idempotencyKey?: string): Promise<{ workflow: Workflow; replayed: boolean }> {
    return this.serialized(async () => {
      this.assertWritable();
      if (idempotencyKey) {
        const existingId = this.state.idempotency[idempotencyKey];
        const existing = existingId ? this.state.workflows[existingId] : undefined;
        if (existing) return { workflow: clone(existing), replayed: true };
      }
      if (this.state.workflows[workflow.id]) throw new Error(`Workflow ${workflow.id} already exists`);
      this.state.workflows[workflow.id] = clone(workflow);
      if (idempotencyKey) this.state.idempotency[idempotencyKey] = workflow.id;
      await this.persist();
      return { workflow: clone(workflow), replayed: false };
    });
  }

  async findByIdempotencyKey(key: string): Promise<Workflow | undefined> {
    const id = this.state.idempotency[key];
    return id && this.state.workflows[id] ? clone(this.state.workflows[id]) : undefined;
  }

  async getWorkflow(id: string): Promise<Workflow | undefined> {
    const workflow = this.state.workflows[id];
    return workflow ? clone(workflow) : undefined;
  }

  async listWorkflows(): Promise<Workflow[]> {
    return Object.values(this.state.workflows)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }

  async mutateWorkflow(id: string, mutate: (draft: Workflow) => void | Promise<void>): Promise<Workflow> {
    return this.serialized(async () => {
      this.assertWritable();
      const current = this.state.workflows[id];
      if (!current) throw new StoreNotFoundError(id);
      const draft = clone(current);
      await mutate(draft);
      this.assertAuditAppendOnly(current, draft);
      draft.updatedAt = new Date().toISOString();
      this.state.workflows[id] = draft;
      await this.persist();
      return clone(draft);
    });
  }

  private assertAuditAppendOnly(before: Workflow, after: Workflow): void {
    if (after.events.length < before.events.length) {
      throw new Error("Audit events are immutable and cannot be removed");
    }
    for (let index = 0; index < before.events.length; index += 1) {
      if (JSON.stringify(before.events[index]) !== JSON.stringify(after.events[index])) {
        throw new Error(`Audit event ${index + 1} is immutable and cannot be modified`);
      }
    }
  }

  private async serialized<T>(operation: () => Promise<T>): Promise<T> {
    const runOperation = async () => {
      const snapshot = clone(this.state);
      try {
        return await operation();
      } catch (error) {
        this.state = snapshot;
        throw error;
      }
    };
    const run = this.writeChain.then(runOperation, runOperation);
    this.writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async persist(): Promise<void> {
    if (this.mode !== "file" || !this.filePath) return;
    try {
      await this.persistFile();
    } catch (error) {
      this.mode = "memory";
      this.healthy = false;
      this.detail = "File persistence failed; writes disabled";
      console.error("ReleaseProof file store write failed", error);
      throw new StoreUnavailableError();
    }
  }

  private assertWritable(): void {
    if (!this.healthy) throw new StoreUnavailableError();
  }

  private async persistFile(): Promise<void> {
    if (!this.filePath) return;
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      for (let attempt = 0; ; attempt += 1) {
        try {
          await rename(temporary, this.filePath);
          return;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          const transientWindowsRename = code === "EPERM" || code === "EACCES" || code === "EBUSY";
          if (!transientWindowsRename || attempt >= 5) throw error;
          await new Promise<void>((resolve) => setTimeout(resolve, 15 * 2 ** attempt));
        }
      }
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

export class StoreNotFoundError extends Error {
  constructor(public readonly workflowId: string) {
    super(`Workflow ${workflowId} was not found`);
    this.name = "StoreNotFoundError";
  }
}

export class StoreUnavailableError extends Error {
  constructor() {
    super("Audit persistence is unavailable; mutations are disabled");
    this.name = "StoreUnavailableError";
  }
}
