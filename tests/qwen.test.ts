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
  requesterEmail: "privacy@acme.example",
  subjectEmail: "analyst@northstar.example",
  resourceId: "campaign-performance",
  requestedRole: "contributor",
  requestedActions: ["aggregate.read", "profile.read"],
  durationHours: 8,
  justification: "Measure campaign lift using minimized profile fields.",
  ticketId: "DPA-203",
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

    const result = await client.extract({ requestText: "release minimized campaign profiles to a verified vendor" });

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

  it("sanitizes Qwen and agreement arguments, ignores unknown and duplicate tools, and completes mandatory reads", async () => {
    openAiMock.create.mockResolvedValue(
      completion({
        content: "",
        tool_calls: [
          {
            id: "call-recipient",
            type: "function",
            function: {
              name: "recipient_lookup",
              arguments: JSON.stringify({ subjectEmail: "attacker@acme.example" }),
            },
          },
          {
            id: "call-share",
            type: "function",
            function: {
              name: "share_current",
              arguments: JSON.stringify({
                subjectEmail: extracted.subjectEmail,
                resourceId: "orders-raw-restricted",
              }),
            },
          },
          {
            id: "call-agreement",
            type: "function",
            function: {
              name: "agreement_lookup",
              arguments: JSON.stringify({ ticketId: "DPA-999" }),
            },
          },
          {
            id: "call-agreement-duplicate",
            type: "function",
            function: {
              name: "agreement_lookup",
              arguments: JSON.stringify({ ticketId: extracted.ticketId }),
            },
          },
          {
            id: "call-unknown",
            type: "function",
            function: { name: "share_create", arguments: "{}" },
          },
        ],
      }),
    );
    const client = new QwenClient("test-key");

    const result = await client.planContextTools(extracted);

    expect(result.calls).toHaveLength(4);
    expect(result.calls.find((call) => call.name === "recipient.lookup")).toEqual({
      name: "recipient.lookup",
      arguments: { subjectEmail: extracted.subjectEmail },
      source: "qwen",
      sanitized: true,
    });
    expect(result.calls.find((call) => call.name === "share.current")).toEqual({
      name: "share.current",
      arguments: { subjectEmail: extracted.subjectEmail, resourceId: extracted.resourceId },
      source: "qwen",
      sanitized: true,
    });
    expect(result.calls.find((call) => call.name === "dataset.lookup")).toMatchObject({
      source: "mandatory",
      sanitized: false,
    });
    expect(result.calls.find((call) => call.name === "agreement.lookup")).toEqual({
      name: "agreement.lookup",
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
    expect(tools.map((tool) => tool.function.name)).toContain("agreement_lookup");
  });

  it("ignores malformed optional agreement calls while still completing the three mandatory reads", async () => {
    openAiMock.create.mockResolvedValue(
      completion({
        content: "",
        tool_calls: [
          {
            id: "call-agreement-malformed",
            type: "function",
            function: { name: "agreement_lookup", arguments: '{"ticketId":' },
          },
        ],
      }),
    );
    const client = new QwenClient("test-key");

    const result = await client.planContextTools(extracted);

    expect(result.calls.map((call) => call.name)).toEqual([
      "recipient.lookup",
      "dataset.lookup",
      "share.current",
    ]);
    expect(result.calls.every((call) => call.source === "mandatory")).toBe(true);
  });

  it("rejects agreement lookup when the validated extraction has no agreement ID", async () => {
    openAiMock.create.mockResolvedValue(
      completion({
        content: "",
        tool_calls: [
          {
            id: "call-agreement-unbound",
            type: "function",
            function: { name: "agreement_lookup", arguments: JSON.stringify({ ticketId: "DPA-999" }) },
          },
        ],
      }),
    );
    const client = new QwenClient("test-key");

    const result = await client.planContextTools({ ...extracted, ticketId: undefined });

    expect(result.calls).toHaveLength(3);
    expect(result.calls.some((call) => call.name === "agreement.lookup")).toBe(false);
  });

  it("falls back once and exposes the responding model", async () => {
    openAiMock.create
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockResolvedValueOnce(completion({ content: JSON.stringify(extracted) }, { prompt_tokens: 9, completion_tokens: 5 }));
    const client = new QwenClient("test-key");

    const result = await client.extract({ requestText: "release minimized profile data" });

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

    await expect(client.extract({ requestText: "release data forever" })).rejects.toThrow();
  });

  it("does not treat a blank model-produced agreement ID as validated", async () => {
    openAiMock.create.mockResolvedValue(completion({ content: JSON.stringify({ ...extracted, ticketId: "   " }) }));
    const client = new QwenClient("test-key");

    await expect(client.extract({ requestText: "release data with a blank agreement" })).rejects.toThrow();
  });

  it("keeps recorded-demo mode fully offline", async () => {
    const client = new QwenClient("");

    const result = await client.extract({
      requestText: "DPA-203 minimized campaign release for 72 hours",
      scenarioId: "campaign-vendor-minimized",
    });

    expect(client.mode).toBe("recorded-demo");
    expect(result.request).toMatchObject({
      subjectEmail: "analyst@northstar.example",
      resourceId: "campaign-performance",
      requestedRole: "admin",
      requestedActions: expect.arrayContaining(["aggregate.read", "profile.read", "raw.export", "consent.override"]),
      durationHours: 72,
      ticketId: "DPA-203",
    });
    const plan = await client.planContextTools(result.request);
    expect(plan.calls.map((call) => call.name)).toEqual([
      "recipient.lookup",
      "dataset.lookup",
      "share.current",
      "agreement.lookup",
    ]);
    expect(plan.calls.at(-1)).toMatchObject({
      arguments: { ticketId: "DPA-203" },
      source: "recorded-demo",
      sanitized: false,
    });
    expect(openAiMock.create).not.toHaveBeenCalled();
  });

  it("does not invent a recorded-demo agreement lookup when no agreement was extracted", async () => {
    const client = new QwenClient("");
    const extraction = await client.extract({
      requestText: "insights@atlas.example requests aggregate product-telemetry for 2 hours to refresh adoption summaries",
    });

    const plan = await client.planContextTools(extraction.request);

    expect(extraction.request.ticketId).toBeUndefined();
    expect(plan.calls.map((call) => call.name)).toEqual([
      "recipient.lookup",
      "dataset.lookup",
      "share.current",
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
        client.extract({ requestText: "first valid release request" }),
        client.extract({ requestText: "second valid release request" }),
      ]);
      expect(maximumActive).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.QWEN_MAX_CONCURRENCY;
      else process.env.QWEN_MAX_CONCURRENCY = previous;
    }
  });
});
