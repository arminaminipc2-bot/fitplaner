import { env } from "../../env.js";
import { AppError } from "../../http.js";
import { REASONING_EFFORT } from "../prompts.js";
import {
  emptyResponse,
  fetchBounded,
  fetchStreaming,
  guard,
  InvalidProviderResponse,
  mapProviderStatus,
  parseJson,
  readSse,
} from "./http.js";
import { inferCapabilities, normalizeBaseUrl } from "./capabilities.js";
import type {
  ChatRequest,
  Completion,
  DiscoveredModel,
  ProviderAdapter,
  ProviderTarget,
  StreamEvent,
  ToolCall,
  Usage,
} from "./types.js";
import { handleMockAiRequest, MOCK_DISCOVERED_MODELS, streamMockAiResponse } from "./mock-ai.js";

/**
 * OpenAI-compatible `/chat/completions` — covers openai, deepseek, groq, ollama
 * and any `custom` base URL. The per-provider difference is the endpoint and
 * whether the reasoning field exists at all: `reasoning_effort` is only sent to
 * a model that understands it, because an unknown field is a guaranteed 400.
 */

type Json = Record<string, unknown>;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asObject = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Shared by the three protocols' guards. */
export function makeGuard(target: ProviderTarget, timeoutMs?: number) {
  return guard({
    provider: target.provider,
    label: target.label,
    // The decrypted key is scrubbed out of every body and error we ever keep.
    redact: target.apiKey ? [target.apiKey] : [],
    ...(timeoutMs ? { timeoutMs } : {}),
  });
}

function messages(request: ChatRequest): Json[] {
  const out: Json[] = [{ role: "system", content: request.system }];
  for (const turn of request.turns) {
    if (turn.images?.length) {
      out.push({
        role: turn.role,
        content: [
          ...(turn.text ? [{ type: "text", text: turn.text }] : []),
          ...turn.images.map((image) => ({
            type: "image_url",
            image_url: { url: `data:${image.mediaType};base64,${image.base64}` },
          })),
        ],
      });
    } else {
      out.push({ role: turn.role, content: turn.text });
    }
  }
  return out;
}

/** Exported so the request shape is testable without a network call. */
export function buildPayload(
  target: ProviderTarget,
  request: ChatRequest,
  stream: boolean,
  supportsReasoning: boolean,
): Json {
  const payload: Json = {
    model: request.modelId,
    messages: messages(request),
    temperature: request.temperature,
    stream,
  };
  if (request.maxOutputTokens) payload.max_completion_tokens = request.maxOutputTokens;
  if (request.tools?.length) {
    payload.tools = request.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters:
          parseJson(tool.parametersJson, makeGuard(target)) ?? {},
      },
    }));
    payload.parallel_tool_calls = false;
  }
  if (supportsReasoning && request.reasoning !== "none") {
    payload.reasoning_effort = REASONING_EFFORT[request.reasoning];
  }
  if (stream) payload.stream_options = { include_usage: true };
  return payload;
}

/**
 * openai/gpt-5 style reasoning models accept `reasoning_effort`. DeepSeek, Groq
 * and Ollama reject unknown fields, so they never get it.
 */
function acceptsReasoningEffort(target: ProviderTarget, request: ChatRequest): boolean {
  if (request.reasoning === "none") return false;
  if (target.provider !== "openai") return false;
  return /^(o[134]|gpt-5|chatgpt-)/i.test(request.modelId);
}

function toolCallsOf(message: Json): ToolCall[] {
  return asArray(message["tool_calls"]).map((entry) => {
    const item = asObject(entry);
    const fn = asObject(item["function"]);
    return {
      id: str(item["id"]),
      name: str(fn["name"]) ?? "",
      // Raw JSON in, raw JSON out — never parsed as a command, never executed.
      argumentsJson: str(fn["arguments"]) ?? "{}",
    };
  });
}

function usageOf(raw: Json): Usage {
  const u = asObject(raw["usage"]);
  return {
    tokensIn: num(u["prompt_tokens"]),
    tokensOut: num(u["completion_tokens"]),
  };
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => str(asObject(part)["text"]) ?? "")
      .join("");
  }
  return "";
}

/** A base URL may already carry the version segment; do not double it. */
export function chatEndpoint(target: ProviderTarget, path: string): string {
  const base = normalizeBaseUrl(target.baseUrl || "");
  const root = /\/v\d+[\w-]*$/.test(base) ? base : `${base}/v1`;
  return `${root}${path}`;
}

function headers(target: ProviderTarget, accept = "application/json"): Record<string, string> {
  const out: Record<string, string> = { "content-type": "application/json", accept };
  if (target.apiKey) out.authorization = `Bearer ${target.apiKey}`;
  return out;
}

function transportFailure(target: ProviderTarget): AppError {
  return new AppError(
    502,
    "ai_network_unreachable",
    `اتصال به سرویس «${target.label}» برقرار نشد. اینترنت یا آدرس پایهٔ سرویس را بررسی کنید.`,
  );
}

export const openaiAdapter: ProviderAdapter = {
  protocol: "openai_compatible",
  defaultBaseUrl: "",

  async complete(target, request) {
    if (target.baseUrl.includes("/mock-ai") || target.baseUrl.includes("/api/internal")) {
      return handleMockAiRequest(request);
    }
    const g = makeGuard(target);
    const result = await fetchBounded(
      chatEndpoint(target, "/chat/completions"),
      {
        method: "POST",
        headers: headers(target),
        body: JSON.stringify(
          buildPayload(target, request, false, acceptsReasoningEffort(target, request)),
        ),
      },
      g,
    ).catch((error: unknown) => {
      if (error instanceof AppError) throw error;
      throw transportFailure(target);
    });

    if (result.status >= 400) throw mapProviderStatus(result.status, g, result.text);
    const raw = asObject(parseJson(result.text, g));
    if (!Array.isArray(raw["choices"])) throw new InvalidProviderResponse(g);
    const choice = asObject(asArray(raw["choices"])[0]);
    const message = asObject(choice["message"]);
    const text = textOf(message["content"]);
    const toolCalls = toolCallsOf(message);
    if (!text.trim() && toolCalls.length === 0) throw emptyResponse(target.label);
    return {
      text,
      toolCalls,
      usage: usageOf(raw),
      finishReason: str(choice["finish_reason"]) ?? "stop",
      modelId: str(raw["model"]) ?? request.modelId,
    };
  },

  async stream(target, request, onEvent: (event: StreamEvent) => void | Promise<void>, signal) {
    if (target.baseUrl.includes("/mock-ai") || target.baseUrl.includes("/api/internal")) {
      let finalCompletion: Completion | null = null;
      for await (const event of streamMockAiResponse(request)) {
        await onEvent(event);
        if (event.type === "done") {
          finalCompletion = event.completion;
        }
      }
      return finalCompletion ?? handleMockAiRequest(request);
    }
    const g = makeGuard(target);
    const handle = await fetchStreaming(
      chatEndpoint(target, "/chat/completions"),
      {
        method: "POST",
        headers: headers(target, "text/event-stream"),
        body: JSON.stringify(
          buildPayload(target, request, true, acceptsReasoningEffort(target, request)),
        ),
      },
      g,
      signal,
    );

    if (handle.res.status >= 400) {
      const body = await handle.res.text().catch(() => "");
      handle.dispose();
      throw mapProviderStatus(handle.res.status, g, body);
    }

    let text = "";
    let usage: Usage = { tokensIn: null, tokensOut: null };
    let finishReason = "stop";
    let modelId = request.modelId;
    // A stream delivers one tool call in fragments, keyed by its index.
    const partial = new Map<number, ToolCall>();

    try {
      for await (const frame of readSse(handle, g)) {
        if (frame.data === "[DONE]") break;
        const chunk = asObject(parseJson(frame.data, g));
        modelId = str(chunk["model"]) ?? modelId;
        if (chunk["usage"]) usage = usageOf(chunk);
        const choice = asObject(asArray(chunk["choices"])[0]);
        finishReason = str(choice["finish_reason"]) ?? finishReason;
        const delta = asObject(choice["delta"]);

        const piece = textOf(delta["content"]);
        if (piece) {
          text += piece;
          await onEvent({ type: "delta", text: piece });
        }

        asArray(delta["tool_calls"]).forEach((entry, position) => {
          const item = asObject(entry);
          const fn = asObject(item["function"]);
          const slot = num(item["index"]) ?? position;
          const current = partial.get(slot) ?? { id: null, name: "", argumentsJson: "" };
          const id = str(item["id"]);
          if (id) current.id = id;
          const name = str(fn["name"]);
          if (name) current.name += name;
          const args = str(fn["arguments"]);
          if (args) current.argumentsJson += args;
          partial.set(slot, current);
        });
      }
    } finally {
      handle.dispose();
    }

    const toolCalls: ToolCall[] = [...partial.values()].map((call) => ({
      ...call,
      argumentsJson: call.argumentsJson || "{}",
    }));
    for (const call of toolCalls) await onEvent({ type: "tool", call });

    if (!text.trim() && toolCalls.length === 0) {
      throw emptyResponse(target.label);
    }

    const completion: Completion = { text, toolCalls, usage, finishReason, modelId };
    await onEvent({ type: "done", completion });
    return completion;
  },

  async listModels(target) {
    if (target.baseUrl.includes("/mock-ai") || target.baseUrl.includes("/api/internal")) {
      return MOCK_DISCOVERED_MODELS;
    }
    const g = makeGuard(target, Math.min(env.AI_TIMEOUT_MS, 15_000));
    const result = await fetchBounded(chatEndpoint(target, "/models"), { method: "GET", headers: headers(target) }, g);
    if (result.status >= 400) throw mapProviderStatus(result.status, g, result.text);
    const raw = asObject(parseJson(result.text, g));
    const items = asArray(raw["data"] ?? raw["models"]);
    const out: DiscoveredModel[] = [];
    for (const entry of items) {
      const item = asObject(entry);
      const id = str(item["id"]) ?? str(item["name"]);
      if (!id) continue;
      out.push(inferCapabilities(target.provider, id));
    }
    return out;
  },

  async verify(target, modelId) {
    return openaiAdapter.complete(target, {
      modelId,
      system: "پینگ",
      turns: [{ role: "user", text: "پینگ" }],
      reasoning: "none",
      maxOutputTokens: 4,
      temperature: 0,
    });
  },
};
