import { afterEach, describe, expect, it } from "vitest";
import { adapterFor } from "../src/services/ai/adapters.js";
import { DEFAULT_BASE_URL } from "../src/services/ai/capabilities.js";
import { installFetch, jsonResponse, openaiChunk, sseResponse, type FetchStub } from "./fake-fetch.js";
import type { ChatRequest, ProviderTarget } from "../src/services/ai/types.js";

/**
 * Wire-shape tests for the three protocols. Offline only: the fetch stub decides
 * what the provider "says", and these assert the exact request we would send.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

/** Mirrors how the service resolves a row: stored baseUrl, else the well-known one. */
function target(over: Partial<ProviderTarget> & Pick<ProviderTarget, "provider">): ProviderTarget {
  const adapter = adapterFor(over.provider);
  return {
    protocol: adapter.protocol,
    label: "کلید من",
    baseUrl: DEFAULT_BASE_URL[over.provider],
    apiKey: "sk-SUPERSECRET-0123456789",
    ...over,
  } as ProviderTarget;
}

function request(over: Partial<ChatRequest> = {}): ChatRequest {
  return {
    modelId: "gpt-4o-mini",
    system: "تو مربی ورزشی هستی.",
    turns: [
      { role: "user", text: "برنامهٔ هفته را بده" },
      { role: "assistant", text: "چهار جلسه کافی است." },
      { role: "user", text: "سنگین‌ترش کن" },
    ],
    reasoning: "none",
    maxOutputTokens: null,
    temperature: 0.4,
    ...over,
  };
}

const openaiReply = {
  model: "gpt-4o-mini",
  choices: [{ message: { content: "باش، حجم را زیاد می‌کنم." }, finish_reason: "stop" }],
  usage: { prompt_tokens: 120, completion_tokens: 15 },
};

describe("openai-compatible protocol", () => {
  it("posts to /v1/chat/completions with a bearer key and the full history", async () => {
    stub = installFetch(() => jsonResponse(openaiReply));
    const reply = await adapterFor("openai").complete(target({ provider: "openai" }), request());

    const call = stub.last();
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call.headers["authorization"]).toBe("Bearer sk-SUPERSECRET-0123456789");
    const body = call.body as Record<string, unknown>;
    expect(body["model"]).toBe("gpt-4o-mini");
    expect(body["stream"]).toBe(false);
    expect(body["reasoning_effort"]).toBeUndefined();
    const messages = body["messages"] as { role: string; content: string }[];
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(reply).toMatchObject({
      text: "باش، حجم را زیاد می‌کنم.",
      usage: { tokensIn: 120, tokensOut: 15 },
      finishReason: "stop",
    });
  });

  it("uses each provider's own well-known base and a stored custom baseUrl", async () => {
    stub = installFetch(() => jsonResponse(openaiReply));
    await adapterFor("deepseek").complete(target({ provider: "deepseek" }), request({ modelId: "deepseek-chat" }));
    expect(stub.last().url).toBe("https://api.deepseek.com/v1/chat/completions");

    await adapterFor("groq").complete(target({ provider: "groq" }), request({ modelId: "llama-3.3-70b-versatile" }));
    expect(stub.last().url).toBe("https://api.groq.com/openai/v1/chat/completions");

    await adapterFor("ollama").complete(target({ provider: "ollama" }), request({ modelId: "llama3.1" }));
    expect(stub.last().url).toBe("http://127.0.0.1:11434/v1/chat/completions");

    // A row's baseUrl wins over the default, and a version path is not doubled.
    await adapterFor("custom").complete(
      target({ provider: "custom", baseUrl: "https://gateway.example.ir/v1" }),
      request(),
    );
    expect(stub.last().url).toBe("https://gateway.example.ir/v1/chat/completions");

    await adapterFor("custom").complete(target({ provider: "custom", baseUrl: "https://gateway.example.ir" }), request());
    expect(stub.last().url).toBe("https://gateway.example.ir/v1/chat/completions");
  });

  it("maps the reasoning level onto reasoning_effort only for models that take it", async () => {
    stub = installFetch(() => jsonResponse({ ...openaiReply, model: "gpt-5" }));
    await adapterFor("openai").complete(target({ provider: "openai" }), request({ modelId: "gpt-5", reasoning: "high" }));
    expect(stub.last().body).toMatchObject({ reasoning_effort: "high" });

    // DeepSeek rejects unknown fields, so it must not receive this one.
    await adapterFor("deepseek").complete(
      target({ provider: "deepseek" }),
      request({ modelId: "deepseek-reasoner", reasoning: "low" }),
    );
    expect((stub.last().body as Record<string, unknown>)["reasoning_effort"]).toBeUndefined();
  });

  it("surfaces a tool call as data instead of treating it as prose", async () => {
    stub = installFetch(() =>
      jsonResponse({
        model: "gpt-4o-mini",
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ id: "call_1", type: "function", function: { name: "add_workout", arguments: "{\"day\":1}" } }],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    );

    const reply = await adapterFor("openai").complete(target({ provider: "openai" }), request());
    expect(reply.text).toBe("");
    expect(reply.toolCalls).toEqual([{ id: "call_1", name: "add_workout", argumentsJson: "{\"day\":1}" }]);
    expect(reply.finishReason).toBe("tool_calls");
    // Nothing was executed: no second call left the process.
    expect(stub.calls).toHaveLength(1);
  });

  it("assembles streamed deltas and streamed tool-call fragments", async () => {
    stub = installFetch(() =>
      sseResponse([
        openaiChunk("سلام"),
        openaiChunk("، حجم را"),
        `data: ${JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, id: "c9", function: { name: "set_goal", arguments: '{"kcal"' } }] }, finish_reason: null }],
        })}\n\n`,
        `data: ${JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ":2200}" } }] }, finish_reason: "tool_calls" }],
        })}\n\n`,
        `data: ${JSON.stringify({ usage: { prompt_tokens: 7, completion_tokens: 3 }, choices: [] })}\n\n`,
        "data: [DONE]\n\n",
      ]),
    );

    const seen: string[] = [];
    const completion = await adapterFor("openai").stream(
      target({ provider: "openai" }),
      request(),
      (event) => {
        if (event.type === "delta") seen.push(event.text);
      },
    );

    expect(seen).toEqual(["سلام", "، حجم را"]);
    expect(completion.text).toBe("سلام، حجم را");
    expect(completion.toolCalls).toEqual([{ id: "c9", name: "set_goal", argumentsJson: '{"kcal":2200}' }]);
    expect(completion.usage).toEqual({ tokensIn: 7, tokensOut: 3 });
    expect((stub.last().body as Record<string, unknown>)["stream"]).toBe(true);
  });
});

describe("anthropic protocol", () => {
  const anthropicTarget = () => target({ provider: "anthropic", baseUrl: "https://api.anthropic.com" });

  it("sends x-api-key, anthropic-version and the required max_tokens", async () => {
    stub = installFetch(() =>
      jsonResponse({
        model: "claude-sonnet-4-5",
        content: [{ type: "text", text: "روز چهارم را سبک‌تر بگیر." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 40, output_tokens: 12 },
      }),
    );

    const reply = await adapterFor("anthropic").complete(
      anthropicTarget(),
      request({ modelId: "claude-sonnet-4-5", temperature: 0.4 }),
    );

    const call = stub.last();
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call.headers["x-api-key"]).toBe("sk-SUPERSECRET-0123456789");
    expect(call.headers["anthropic-version"]).toBe("2023-06-01");
    expect(call.headers["authorization"]).toBeUndefined();
    const body = call.body as Record<string, unknown>;
    expect(body["system"]).toBe("تو مربی ورزشی هستی.");
    expect(body["max_tokens"]).toBe(2048);
    expect(body["messages"]).toBeInstanceOf(Array);
    expect(reply.text).toBe("روز چهارم را سبک‌تر بگیر.");
    expect(reply.usage).toEqual({ tokensIn: 40, tokensOut: 12 });
  });

  it("maps thinking to budget_tokens and drops temperature, which the API forbids together", async () => {
    stub = installFetch(() => jsonResponse({ content: [{ type: "text", text: "باش" }], usage: {} }));
    await adapterFor("anthropic").complete(
      anthropicTarget(),
      request({ modelId: "claude-sonnet-4-5", reasoning: "medium", maxOutputTokens: 16000 }),
    );

    const body = stub.last().body as Record<string, unknown>;
    expect(body["thinking"]).toEqual({ type: "enabled", budget_tokens: 4096 });
    expect(body["temperature"]).toBeUndefined();
  });

  it("keeps max_tokens above the thinking budget instead of sending a doomed pair", async () => {
    stub = installFetch(() => jsonResponse({ content: [{ type: "text", text: "باش" }], usage: {} }));
    await adapterFor("anthropic").complete(
      anthropicTarget(),
      request({ modelId: "claude-opus-4-1", reasoning: "high", maxOutputTokens: 2000 }),
    );
    const body = stub.last().body as Record<string, unknown>;
    const thinking = body["thinking"] as { budget_tokens: number };
    expect(thinking.budget_tokens).toBeLessThan(body["max_tokens"] as number);
  });

  it("reads tool_use blocks and stream events", async () => {
    stub = installFetch(() =>
      jsonResponse({
        content: [{ type: "tool_use", id: "toolu_1", name: "replace_workout", input: { day: 2 } }],
        usage: {},
      }),
    );
    const completion = await adapterFor("anthropic").complete(anthropicTarget(), request({ modelId: "claude-sonnet-4-5" }));
    expect(completion.toolCalls).toEqual([{ id: "toolu_1", name: "replace_workout", argumentsJson: "{\"day\":2}" }]);

    stub.restore();
    stub = installFetch(() =>
      sseResponse([
        `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { model: "claude-sonnet-4-5", usage: { input_tokens: 11 } } })}\n\n`,
        `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text" } })}\n\n`,
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "آرام" } })}\n\n`,
        `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "برو" } })}\n\n`,
        `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } })}\n\n`,
        "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
      ]),
    );
    const streamed = await adapterFor("anthropic").stream(
      anthropicTarget(),
      request({ modelId: "claude-sonnet-4-5" }),
      () => {},
    );
    expect(streamed.text).toBe("آرامبرو");
    expect(streamed.finishReason).toBe("end_turn");
    expect(streamed.usage).toEqual({ tokensIn: 11, tokensOut: 5 });
  });
});

describe("gemini protocol", () => {
  const geminiTarget = () =>
    target({ provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta" });

  it("uses :generateContent, x-goog-api-key and the model/user roles", async () => {
    stub = installFetch(() =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "پروتئین را بالا ببر" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 33, candidatesTokenCount: 9 },
      }),
    );

    const reply = await adapterFor("gemini").complete(
      geminiTarget(),
      request({ modelId: "gemini-2.5-flash" }),
    );
    const call = stub.last();
    expect(call.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(call.headers["x-goog-api-key"]).toBe("sk-SUPERSECRET-0123456789");
    // The key must never ride along in the query string, where logs keep it.
    expect(call.url).not.toContain("key=");
    const body = call.body as Record<string, unknown>;
    expect((body["systemInstruction"] as { parts: { text: string }[] }).parts[0].text).toBe(
      "تو مربی ورزشی هستی.",
    );
    const contents = body["contents"] as { role: string }[];
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(reply.text).toBe("پروتئین را بالا ببر");
    expect(reply.usage).toEqual({ tokensIn: 33, tokensOut: 9 });
  });

  it("maps the level to thinkingConfig.thinkingBudget", async () => {
    stub = installFetch(() =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: "بله" }] } }], usageMetadata: {} }),
    );
    await adapterFor("gemini").complete(geminiTarget(), request({ modelId: "gemini-2.5-pro", reasoning: "high" }));
    const body = stub.last().body as { generationConfig: { thinkingConfig?: { thinkingBudget: number } } };
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 12000 });

    await adapterFor("gemini").complete(geminiTarget(), request({ modelId: "gemini-2.5-pro", reasoning: "none" }));
    const plain = stub.last().body as { generationConfig: { thinkingConfig?: unknown } };
    expect(plain.generationConfig.thinkingConfig).toBeUndefined();
  });

  it("streams through :streamGenerateContent?alt=sse", async () => {
    stub = installFetch(() =>
      sseResponse([
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "نیمه" }] } }] })}\n\n`,
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: " + کامل" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } })}\n\n`,
      ]),
    );
    const pieces: string[] = [];
    const completion = await adapterFor("gemini").stream(
      geminiTarget(),
      request({ modelId: "gemini-2.5-flash" }),
      (event) => {
        if (event.type === "delta") pieces.push(event.text);
      },
    );
    expect(stub.last().url).toContain(":streamGenerateContent?alt=sse");
    expect(pieces).toEqual(["نیمه", " + کامل"]);
    expect(completion.text).toBe("نیمه + کامل");
  });

  it("keeps an inline image with the turn it belongs to", async () => {
    stub = installFetch(() =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: "یک بشقاب برنج" }] } }], usageMetadata: {} }),
    );
    await adapterFor("gemini").complete(
      geminiTarget(),
      request({
        modelId: "gemini-2.5-flash",
        turns: [{ role: "user", text: "این را بخورم؟", images: [{ mediaType: "image/png", base64: "AAAA" }] }],
      }),
    );
    const body = stub.last().body as { contents: { parts: unknown[] }[] };
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: "image/png", data: "AAAA" } });
  });
});
