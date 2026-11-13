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
 * Google Gemini — `v1beta models/<id>:generateContent` and
 * `:streamGenerateContent?alt=sse`. The key travels in `x-goog-api-key`, roles
 * are `user`/`model`, and the thinking budget is a token count, not a level.
 */

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
  const out: Record<string, string> = { "content-type": "application/json", accept };
  if (target.apiKey) out["x-goog-api-key"] = target.apiKey;
  return out;
}

/** baseUrl is the version root, e.g. https://generativelanguage.googleapis.com/v1beta */
function modelUrl(target: ProviderTarget, modelId: string, stream: boolean): string {
  const base = normalizeBaseUrl(target.baseUrl || "https://generativelanguage.googleapis.com/v1beta");
  const model = modelId.replace(/^models\//, "");
  const method = stream ? "streamGenerateContent?alt=sse" : "generateContent";
  return `${base}/models/${encodeURIComponent(model)}:${method}`;
}

function parts(turn: ChatRequest["turns"][number]): Json[] {
  const out: Json[] = [];
  if (turn.text) out.push({ text: turn.text });
  for (const image of turn.images ?? []) {
    out.push({ inlineData: { mimeType: image.mediaType, data: image.base64 } });
  }
  if (!out.length) out.push({ text: " " });
  return out;
}

export function buildPayload(target: ProviderTarget, request: ChatRequest): Json {
  const payload: Json = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: request.turns.map((turn) => ({
      // Gemini's own vocabulary: the assistant is called "model".
      role: turn.role === "assistant" ? "model" : "user",
      parts: parts(turn),
    })),
    generationConfig: {
      temperature: request.temperature,
      ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
    },
  };

  // The provider takes a token budget, not a level. "none" sends no
  // thinkingConfig at all: several Gemini models refuse thinkingBudget 0 with a
  // 400, and an unknown field is exactly what this layer must not do.
  if (request.reasoning !== "none" && /^gemini-[23]/i.test(request.modelId)) {
    const generation = asObject(payload["generationConfig"]);
    generation["thinkingConfig"] = {
      thinkingBudget: REASONING_BUDGET_TOKENS[request.reasoning],
    };
  }

  if (request.tools?.length) {
    payload.tools = [
      {
        functionDeclarations: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: parseJson(tool.parametersJson, g(target)) ?? {},
        })),
      },
    ];
  }

  return payload;
}

function partsResult(candidateParts: unknown[]): { text: string; toolCalls: ToolCall[] } {
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const entry of candidateParts) {
    const part = asObject(entry);
    if (typeof part["text"] === "string" && !part["thought"]) text += part["text"];
    const call = asObject(part["functionCall"]);
    if (Object.keys(call).length) {
      toolCalls.push({
        id: null,
        name: str(call["name"]) ?? "",
        argumentsJson: JSON.stringify(call["args"] ?? {}),
      });
    }
  }
  return { text, toolCalls };
}

function usageOf(raw: Json): Usage {
  const meta = asObject(raw["usageMetadata"]);
  const prompt = num(meta["promptTokenCount"]);
  const candidates = num(meta["candidatesTokenCount"]);
  const thoughts = num(meta["thoughtsTokenCount"]);
  return {
    tokensIn: prompt,
    tokensOut: candidates === null && thoughts === null ? null : (candidates ?? 0) + (thoughts ?? 0),
  };
}

function completionFrom(root: Json, request: ChatRequest, target: ProviderTarget): Completion {
  const gr = g(target);
  const candidate = asObject(asArray(root["candidates"])[0]);
  if (!Object.keys(candidate).length) throw new InvalidProviderResponse(gr);
  const content = asObject(candidate["content"]);
  const { text, toolCalls } = partsResult(asArray(content["parts"]));
  const blocked = str(asObject(root["promptFeedback"])["blockReason"]);
  if (blocked) {
    throw new AppError(
      422,
      "provider_content_blocked",
      `سرویس «${gr.label}» به دلیل سیاست محتوایی پاسخی نداد (علت: ${blocked}). سؤال را بازنویسی کنید.`,
    );
  }
  return {
    text,
    toolCalls,
    usage: usageOf(root),
    finishReason: str(candidate["finishReason"]) ?? "stop",
    modelId: request.modelId,
  };
}

export const geminiAdapter: ProviderAdapter = {
  protocol: "gemini",
  defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",

  async complete(target, request) {
    const gr = g(target);
    const result = await fetchBounded(
      modelUrl(target, request.modelId, false),
      { method: "POST", headers: headers(target), body: JSON.stringify(buildPayload(target, request)) },
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
    if (!Array.isArray(raw["candidates"])) throw new InvalidProviderResponse(gr);
    return completionFrom(raw, request, target);
  },

  async stream(target, request, onEvent: (event: StreamEvent) => void | Promise<void>, signal) {
    const gr = g(target);
    const handle = await fetchStreaming(
      modelUrl(target, request.modelId, true),
      {
        method: "POST",
        headers: headers(target, "text/event-stream"),
        body: JSON.stringify(buildPayload(target, request)),
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
    const toolCalls: ToolCall[] = [];

    try {
      for await (const frame of readSse(handle, gr)) {
        const root = asObject(parseJson(frame.data, gr));
        const candidate = asObject(asArray(root["candidates"])[0]);
        if (!Object.keys(candidate).length) continue;
        const content = asObject(candidate["content"]);
        const chunk = partsResult(asArray(content["parts"]));
        if (chunk.text) {
          text += chunk.text;
          await onEvent({ type: "delta", text: chunk.text });
        }
        for (const call of chunk.toolCalls) {
          toolCalls.push(call);
          await onEvent({ type: "tool", call });
        }
        finishReason = str(candidate["finishReason"]) ?? finishReason;
        if (root["usageMetadata"]) usage = usageOf(root);
      }
    } finally {
      handle.dispose();
    }

    if (!text.trim() && toolCalls.length === 0) {
      throw new AppError(
        502,
        "ai_empty_response",
        `سرویس «${target.label}» بدون متن پاسخ برگرداند. چیزی ذخیره نشد؛ دوباره تلاش کنید.`,
      );
    }

    const completion: Completion = { text, toolCalls, usage, finishReason, modelId: request.modelId };
    await onEvent({ type: "done", completion });
    return completion;
  },

  /**
   * /models reports ids and `supportedGenerationMethods`. That is enough to know
   * streaming for real; vision and tool support are not reported, so they are
   * returned as an explicitly labelled inference rather than a claim.
   */
  async listModels(target) {
    const gr = g(target, Math.min(env.AI_TIMEOUT_MS, 15_000));
    const base = normalizeBaseUrl(target.baseUrl || "https://generativelanguage.googleapis.com/v1beta");
    // The key goes in the header only: a query-string key would land in every
    // access log between here and Google.
    const result = await fetchBounded(
      `${base}/models?page_size=200`,
      { method: "GET", headers: headers(target) },
      gr,
    );
    if (result.status >= 400) throw mapProviderStatus(result.status, gr, result.text);
    const raw = asObject(parseJson(result.text, gr));
    const out: DiscoveredModel[] = [];
    for (const entry of asArray(raw["models"])) {
      const item = asObject(entry);
      const name = str(item["name"]);
      if (!name) continue;
      const id = name.replace(/^models\//, "");
      const methods = asArray(item["supportedGenerationMethods"]).map((m) => String(m));
      const inferred = inferCapabilities(target.provider, id);
      const reported = methods.length > 0;
      const notes = [
        inferred.note,
        reported ? "gemini_reports_generation_methods_only" : "gemini_list_reports_no_capabilities",
      ]
        .filter((n): n is string => Boolean(n))
        .join(",");
      out.push({
        ...inferred,
        label: str(item["displayName"]) ?? id,
        capabilities: {
          ...inferred.capabilities,
          // Streaming is a fact when the provider lists the method; otherwise a guess.
          streaming: reported ? methods.some((m) => m.includes("streamGenerateContent")) : inferred.capabilities.streaming,
        },
        note: notes,
      });
    }
    return out;
  },

  async verify(target, modelId) {
    return geminiAdapter.complete(target, {
      modelId,
      system: "پینگ",
      turns: [{ role: "user", text: "پینگ" }],
      reasoning: "none",
      maxOutputTokens: 8,
      temperature: 0,
    });
  },
};
