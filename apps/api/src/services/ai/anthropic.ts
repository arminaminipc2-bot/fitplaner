import { env } from "../../env.js";
import { AppError } from "../../http.js";
import { REASONING_BUDGET_TOKENS } from "../prompts.js";
import {
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

/**
 * Anthropic Messages API (`/v1/messages`). Two protocol quirks are handled here
 * rather than leaking upward: `max_tokens` is mandatory, and `temperature` must
 * not be sent while extended thinking is on — that combination is a hard 400.
 */

const ANTHROPIC_VERSION = "2023-06-01";
const FALLBACK_MAX_TOKENS = 2048;

type Json = Record<string, unknown>;
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asObject = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function g(target: ProviderTarget, timeoutMs?: number) {
  return guard({
    provider: target.provider,
    label: target.label,
    redact: target.apiKey ? [target.apiKey] : [],
    ...(timeoutMs ? { timeoutMs } : {}),
  });
}

function headers(target: ProviderTarget, accept = "application/json"): Record<string, string> {
  const out: Record<string, string> = {
    "content-type": "application/json",
    accept,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  // x-api-key, not a bearer token — the one place this differs from OpenAI.
  if (target.apiKey) out["x-api-key"] = target.apiKey;
  return out;
}

function url(target: ProviderTarget, path: string): string {
  return `${normalizeBaseUrl(target.baseUrl || "https://api.anthropic.com")}${path}`;
}

function contentBlocks(request: ChatRequest["turns"][number]): Json[] {
  const blocks: Json[] = [];
  if (request.text) blocks.push({ type: "text", text: request.text });
  for (const image of request.images ?? []) {
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.base64 },
    });
  }
  if (!blocks.length) blocks.push({ type: "text", text: " " });
  return blocks;
}

export function buildPayload(target: ProviderTarget, request: ChatRequest, stream: boolean): Json {
  const thinking =
    request.reasoning !== "none" && supportsThinking(request.modelId)
      ? { type: "enabled" as const, budget_tokens: REASONING_BUDGET_TOKENS[request.reasoning] }
      : null;

  const maxTokens = request.maxOutputTokens ?? FALLBACK_MAX_TOKENS;
  // budget_tokens must stay strictly below max_tokens or the request is refused.
  if (thinking) {
    const budget = num(thinking.budget_tokens) ?? 1024;
    if (maxTokens <= budget) thinking.budget_tokens = Math.max(1024, Math.floor(maxTokens / 2));
  }

  const payload: Json = {
    model: request.modelId,
    system: request.system,
    messages: request.turns.map((turn) => ({ role: turn.role, content: contentBlocks(turn) })),
    max_tokens: maxTokens,
    stream,
  };
  if (!thinking) payload.temperature = request.temperature;
  if (thinking) payload.thinking = thinking;
  if (request.tools?.length) {
    payload.tools = request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: parseJson(tool.parametersJson, g(target)) ?? {},
    }));
  }
  return payload;
}

function blocksToResult(content: unknown[]): { text: string; toolCalls: ToolCall[] } {
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const entry of content) {
    const block = asObject(entry);
    const type = str(block["type"]);
    if (type === "text") text += str(block["text"]) ?? "";
    else if (type === "tool_use") {
      toolCalls.push({
        id: str(block["id"]),
        name: str(block["name"]) ?? "",
        // The model's input object is kept as JSON text for Phase 6 to validate.
        argumentsJson: JSON.stringify(block["input"] ?? {}),
      });
    }
  }
  return { text, toolCalls };
}

function usageOf(raw: Json): Usage {
  const u = asObject(raw["usage"]);
  return { tokensIn: num(u["input_tokens"]), tokensOut: num(u["output_tokens"]) };
}

/** `usage` as delivered by the event itself, not nested inside a root object. */
function usageFrom(u: Json): Usage {
  return { tokensIn: num(u["input_tokens"]), tokensOut: num(u["output_tokens"]) };
}

/**
 * Extended thinking exists on Sonnet/Opus 4 and on 3.5/3.7; older models reject
 * the field, so the level is simply not translated for them.
 */
function supportsThinking(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.startsWith("claude-") && /(3-[567]|-4)/.test(id);
}

export const anthropicAdapter: ProviderAdapter = {
  protocol: "anthropic",
  defaultBaseUrl: "https://api.anthropic.com",

  async complete(target, request) {
    const gr = g(target);
    const result = await fetchBounded(
      url(target, "/v1/messages"),
      { method: "POST", headers: headers(target), body: JSON.stringify(buildPayload(target, request, false)) },
      gr,
    ).catch((error: unknown) => {
      if (error instanceof AppError) throw error;
      throw new AppError(
        502,
        "ai_network_unreachable",
        `اتصال به سرویس «${target.label}» برقرار نشد. اینترنت یا آدرس پایهٔ سرویس را بررسی کنید.`,
      );
    });

    if (result.status >= 400) throw mapProviderStatus(result.status, gr, result.text);
    const raw = asObject(parseJson(result.text, gr));
    if (!Array.isArray(raw["content"])) throw new InvalidProviderResponse(gr);
    const { text, toolCalls } = blocksToResult(asArray(raw["content"]));
    return {
      text,
      toolCalls,
      usage: usageOf(raw),
      finishReason: str(raw["stop_reason"]) ?? "stop",
      modelId: str(raw["model"]) ?? request.modelId,
    };
  },

  async stream(target, request, onEvent: (event: StreamEvent) => void | Promise<void>, signal) {
    const gr = g(target);
    const handle = await fetchStreaming(
      url(target, "/v1/messages"),
      {
        method: "POST",
        headers: headers(target, "text/event-stream"),
        body: JSON.stringify(buildPayload(target, request, true)),
      },
      gr,
      signal,
    );

    if (handle.res.status >= 400) {
      const body = await handle.res.text().catch(() => "");
      handle.dispose();
      throw mapProviderStatus(handle.res.status, gr, body);
    }

    let text = "";
    let usage: Usage = { tokensIn: null, tokensOut: null };
    let finishReason = "stop";
    let modelId = request.modelId;
    // input_json_delta arrives as fragments of one tool argument object.
    const argBuffers = new Map<number, string>();
    const callNames = new Map<number, string>();
    const callIds = new Map<number, string | null>();

    try {
      for await (const frame of readSse(handle, gr)) {
        const event = asObject(parseJson(frame.data, gr));
        const type = frame.event === "message" ? str(event["type"]) ?? "" : frame.event;

        if (type === "message_start") {
          const message = asObject(event["message"]);
          modelId = str(message["model"]) ?? modelId;
          if (message["usage"]) usage = usageFrom(asObject(message["usage"]));
        } else if (type === "content_block_start") {
          const block = asObject(event["content_block"]);
          const index = num(event["index"]) ?? 0;
          if (str(block["type"]) === "tool_use") {
            callNames.set(index, str(block["name"]) ?? "");
            callIds.set(index, str(block["id"]));
            argBuffers.set(index, "");
          }
        } else if (type === "content_block_delta") {
          const delta = asObject(event["delta"]);
          const index = num(event["index"]) ?? 0;
          const kind = str(delta["type"]);
          if (kind === "text_delta") {
            const piece = str(delta["text"]) ?? "";
            if (piece) {
              text += piece;
              await onEvent({ type: "delta", text: piece });
            }
          } else if (kind === "input_json_delta") {
            argBuffers.set(index, (argBuffers.get(index) ?? "") + (str(delta["partial_json"]) ?? ""));
          } else if (kind === "thinking_delta") {
            // Reasoning text is not part of the answer; it is dropped as content
            // but the model still billed it, so the transcript stays honest.
          }
        } else if (type === "message_delta") {
          const delta = asObject(event["delta"]);
          finishReason = str(delta["stop_reason"]) ?? finishReason;
          const u = usageFrom(asObject(event["usage"]));
          usage = { tokensIn: usage.tokensIn ?? u.tokensIn, tokensOut: u.tokensOut ?? usage.tokensOut };
        } else if (type === "error") {
          handle.dispose();
          throw mapProviderStatus(502, gr, JSON.stringify(event["error"] ?? ""));
        }
      }
    } finally {
      handle.dispose();
    }

    const toolCalls: ToolCall[] = [...argBuffers.keys()].map((index) => ({
      id: callIds.get(index) ?? null,
      name: callNames.get(index) ?? "",
      argumentsJson: argBuffers.get(index)?.trim() || "{}",
    }));
    for (const call of toolCalls) await onEvent({ type: "tool", call });

    if (!text.trim() && toolCalls.length === 0) {
      throw new AppError(
        502,
        "ai_empty_response",
        `سرویس «${target.label}» بدون متن پاسخ برگرداند. چیزی ذخیره نشد؛ دوباره تلاش کنید.`,
      );
    }

    const completion: Completion = { text, toolCalls, usage, finishReason, modelId };
    await onEvent({ type: "done", completion });
    return completion;
  },

  /**
   * /v1/models is a real endpoint and returns ids + display names. It says
   * nothing about vision/tools, so those stay a labelled inference.
   */
  async listModels(target) {
    const gr = g(target, Math.min(env.AI_TIMEOUT_MS, 15_000));
    const result = await fetchBounded(
      `${url(target, "/v1/models")}?limit=1000`,
      { method: "GET", headers: headers(target) },
      gr,
    );
    if (result.status >= 400) throw mapProviderStatus(result.status, gr, result.text);
    const raw = asObject(parseJson(result.text, gr));
    const out: DiscoveredModel[] = [];
    for (const entry of asArray(raw["data"])) {
      const item = asObject(entry);
      const id = str(item["id"]);
      if (!id) continue;
      const label = str(item["display_name"]) ?? id;
      out.push({ ...inferCapabilities(target.provider, id), label });
    }
    return out;
  },

  async verify(target, modelId) {
    return anthropicAdapter.complete(target, {
      modelId,
      system: "پینگ",
      turns: [{ role: "user", text: "پینگ" }],
      reasoning: "none",
      maxOutputTokens: 4,
      temperature: 0,
    });
  },
};
