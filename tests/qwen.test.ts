import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedAccessRequest } from "../shared/contracts.js";

const openAiMock = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: openAiMock.create } };
  },
}));

import { QwenClient } from "../server/qwen.js";

const extracted: ExtractedAccessRequest = {
  requesterEmail: "mateo@acme.example",
  subjectEmail: "mateo@acme.example",
  resourceId: "storefront-staging",
  requestedRole: "contributor",
  requestedActions: ["read", "write", "deploy"],
  durationHours: 12,
  justification: "Deploy and validate a staging endpoint.",
  ticketId: "DEV-193",
  confidence: 0.98,
  source: "text",
};

function completion(message: Record<string, unknown>, usage = { prompt_tokens: 31, completion_tokens: 17 }) {
  return { choices: [{ message }], usage };
}

describe("QwenClient", () => {
  beforeEach(() => {
    openAiMock.create.mockReset();
  });

  it("uses non-thinking structured output and records live usage", async () => {
    openAiMock.create.mockResolvedValue(completion({ content: JSON.stringify(extracted) }));
    const client = new QwenClient("test-key");

    const result = await client.extract({ requestText: "grant staging contributor access" });

    expect(result.request).toEqual(extracted);
    expect(result.stats).toMatchObject({
      model: "qwen3.7-plus",
      fallbackUsed: false,
      promptTokens: 31,
      completionTokens: 17,
    });
    expect(openAiMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "qwen3.7-plus",
        enable_thinking: false,
        response_format: { type: "json_object" },
      }),
    );
  });

  it("sanitizes Qwen and ticket arguments, ignores unknown and duplicate tools, and completes mandatory reads", async () => {
    openAiMock.create.mockResolvedValue(
      completion({
        content: "",
        tool_calls: [
          {
            id: "call-directory",
            type: "function",
            function: {
              name: "directory_lookup",
              arguments: JSON.stringify({ subjectEmail: "attacker@acme.example" }),
            },
          },
          {
            id: "call-access",
            type: "function",
            function: {
              name: "access_current",
              arguments: JSON.stringify({
                subjectEmail: extracted.subjectEmail,
                resourceId: "finance-ledger-prod",
              }),
            },
          },
          {
            id: "call-ticket",
            type: "function",
            function: {
              name: "ticket_lookup",
              arguments: JSON.stringify({ ticketId: "SEC-999" }),
            },
          },
          {
            id: "call-ticket-duplicate",
            type: "function",
            function: {
              name: "ticket_lookup",
              arguments: JSON.stringify({ ticketId: extracted.ticketId }),
            },
          },
          {
            id: "call-unknown",
            type: "function",
            function: { name: "grant_access", arguments: "{}" },
          },
        ],
      }),
    );
    const client = new QwenClient("test-key");

    const result = await client.planContextTools(extracted);

    expect(result.calls).toHaveLength(4);
    expect(result.calls.find((call) => call.name === "directory.lookup")).toEqual({
      name: "directory.lookup",
      arguments: { subjectEmail: extracted.subjectEmail },
      source: "qwen",
      sanitized: true,
    });
    expect(result.calls.find((call) => call.name === "access.current")).toEqual({
      name: "access.current",
      arguments: { subjectEmail: extracted.subjectEmail, resourceId: extracted.resourceId },
      source: "qwen",
      sanitized: true,
    });
    expect(result.calls.find((call) => call.name === "resource.lookup")).toMatchObject({
      source: "mandatory",
      sanitized: false,
    });
    expect(result.calls.find((call) => call.name === "ticket.lookup")).toEqual({
      name: "ticket.lookup",
      arguments: { ticketId: extracted.ticketId },
      source: "qwen",
      sanitized: true,
    });
    expect(openAiMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        enable_thinking: false,
        tool_choice: "required",
        parallel_tool_calls: true,
      }),
    );
    const tools = openAiMock.create.mock.calls[0]?.[0]?.tools as Array<{
      function: { name: string };
    }>;
    expect(tools.map((tool) => tool.function.name)).toContain("ticket_lookup");
  });

  it("ignores malformed optional ticket calls while still completing the three mandatory reads", async () => {
    openAiMock.create.mockResolvedValue(
      completion({
        content: "",
        tool_calls: [
          {
            id: "call-ticket-malformed",
            type: "function",
            function: { name: "ticket_lookup", arguments: '{"ticketId":' },
          },
        ],
      }),
    );
    const client = new QwenClient("test-key");

    const result = await client.planContextTools(extracted);

    expect(result.calls.map((call) => call.name)).toEqual([
      "directory.lookup",
      "resource.lookup",
      "access.current",
    ]);
    expect(result.calls.every((call) => call.source === "mandatory")).toBe(true);
  });

  it("rejects ticket lookup when the validated extraction has no ticketId", async () => {
    openAiMock.create.mockResolvedValue(
      completion({
        content: "",
        tool_calls: [
          {
            id: "call-ticket-unbound",
            type: "function",
            function: { name: "ticket_lookup", arguments: JSON.stringify({ ticketId: "SEC-902" }) },
          },
        ],
      }),
    );
    const client = new QwenClient("test-key");

    const result = await client.planContextTools({ ...extracted, ticketId: undefined });

    expect(result.calls).toHaveLength(3);
    expect(result.calls.some((call) => call.name === "ticket.lookup")).toBe(false);
  });

  it("falls back once and exposes the responding model", async () => {
    openAiMock.create
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockResolvedValueOnce(completion({ content: JSON.stringify(extracted) }, { prompt_tokens: 9, completion_tokens: 5 }));
    const client = new QwenClient("test-key");

    const result = await client.extract({ requestText: "grant staging contributor access" });

    expect(openAiMock.create).toHaveBeenCalledTimes(2);
    expect(openAiMock.create.mock.calls.map(([params]) => params.model)).toEqual(["qwen3.7-plus", "qwen3.6-flash"]);
    expect(result.stats).toMatchObject({
      model: "qwen3.6-flash",
      fallbackUsed: true,
      promptTokens: 9,
      completionTokens: 5,
    });
  });

  it("fails closed on a schema-invalid extraction", async () => {
    openAiMock.create.mockResolvedValue(completion({ content: JSON.stringify({ ...extracted, durationHours: 0 }) }));
    const client = new QwenClient("test-key");

    await expect(client.extract({ requestText: "grant access forever" })).rejects.toThrow();
  });

  it("does not treat a blank model-produced ticketId as validated", async () => {
    openAiMock.create.mockResolvedValue(completion({ content: JSON.stringify({ ...extracted, ticketId: "   " }) }));
    const client = new QwenClient("test-key");

    await expect(client.extract({ requestText: "grant access with a blank ticket" })).rejects.toThrow();
  });

  it("keeps recorded-demo mode fully offline", async () => {
    const client = new QwenClient("");

    const result = await client.extract({
      requestText: "DEV-193 contributor storefront-staging for 12 hours",
      scenarioId: "developer-staging-deploy",
    });

    expect(client.mode).toBe("recorded-demo");
    expect(result.request).toMatchObject({
      subjectEmail: extracted.subjectEmail,
      resourceId: extracted.resourceId,
      requestedRole: extracted.requestedRole,
      requestedActions: extracted.requestedActions,
      durationHours: extracted.durationHours,
      ticketId: extracted.ticketId,
    });
    const plan = await client.planContextTools(result.request);
    expect(plan.calls.map((call) => call.name)).toEqual([
      "directory.lookup",
      "resource.lookup",
      "access.current",
      "ticket.lookup",
    ]);
    expect(plan.calls.at(-1)).toMatchObject({
      arguments: { ticketId: extracted.ticketId },
      source: "recorded-demo",
      sanitized: false,
    });
    expect(openAiMock.create).not.toHaveBeenCalled();
  });

  it("does not invent a recorded-demo ticket lookup when no ticket was extracted", async () => {
    const client = new QwenClient("");
    const extraction = await client.extract({
      requestText: "mateo@acme.example requests viewer on storefront-staging for 2 hours to inspect deployment health",
    });

    const plan = await client.planContextTools(extraction.request);

    expect(extraction.request.ticketId).toBeUndefined();
    expect(plan.calls.map((call) => call.name)).toEqual([
      "directory.lookup",
      "resource.lookup",
      "access.current",
    ]);
  });

  it("queues live requests above the configured concurrency bound", async () => {
    const previous = process.env.QWEN_MAX_CONCURRENCY;
    process.env.QWEN_MAX_CONCURRENCY = "1";
    let active = 0;
    let maximumActive = 0;
    openAiMock.create.mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return completion({ content: JSON.stringify(extracted) });
    });

    try {
      const client = new QwenClient("test-key");
      await Promise.all([
        client.extract({ requestText: "first valid staging request" }),
        client.extract({ requestText: "second valid staging request" }),
      ]);
      expect(maximumActive).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.QWEN_MAX_CONCURRENCY;
      else process.env.QWEN_MAX_CONCURRENCY = previous;
    }
  });
});
