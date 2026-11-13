import { env } from "../env.js";
import { prisma } from "../db.js";
import { AppError } from "../http.js";
import { REASONING } from "../domain.js";
import { decryptSecret } from "../secrets.js";
import { adapterFor } from "./ai/adapters.js";
import { buildProfileContext } from "./ai/context.js";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  inferCapabilities,
  normalizeBaseUrl,
  PROTOCOL_LABEL_FA,
  PROVIDER_PROTOCOL,
  PROVIDER_REQUIRES_KEY,
} from "./ai/capabilities.js";
import type {
  Capabilities,
  ChatTurn,
  ImageInput,
  ProviderId,
  ProviderTarget,
  Reasoning,
  StreamEvent,
} from "./ai/types.js";
import { systemPrompt } from "./prompts.js";
import { toolSchemasFor } from "./ai/tools.js";

export type AssistantKind = "coach" | "nutritionist";

export type Reply = {
  content: string;
  providerId: string;
  modelId: string;
  tokensIn: number | null;
  tokensOut: number | null;
  /** The provider id (openai, gemini, …) — never a secret. */
  provider: ProviderId;
  /** Tool calls the model asked for. Surfaced, not executed (Phase 6). */
  toolCalls: { id: string | null; name: string; argumentsJson: string }[];
  finishReason: string;
  /** Announced, never silent: e.g. a streaming model that had to be asked once. */
  notices: { code: string; message: string }[];
};

import { resolveImages, type AttachmentRef } from "./ai/images.js";
export type { AttachmentRef };

export type ReplyOptions = {
  conversationId?: string;
  /** Which AiProviderConfig row to use; defaults to the user's enabled default. */
  providerConfigId?: string;
  modelId?: string;
  reasoning?: Reasoning;
  attachments?: AttachmentRef[];
  /** Ask for a tool-capable answer. Refused outright if the model cannot. */
  requireTools?: boolean;
  /** Offer the assistant its tools when the model supports them (chat default). */
  enableTools?: boolean;
  /** Results of read tools, appended as a final user turn for the model. */
  extraToolResults?: string;
  /** Client insists on a stream: a non-streaming model is then refused, not downgraded. */
  requireStreaming?: boolean;
  onEvent?: (event: StreamEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

function unknownReasoning(value: string | undefined): Reasoning {
  return REASONING.includes(value as never) ? (value as Reasoning) : "medium";
}

/**
 * Loads the provider row for *this* user only. A row id that belongs to someone
 * else reads as missing, so no request can borrow another account's key.
 */
async function resolveProvider(userId: string, options: ReplyOptions) {
  if (options.providerConfigId) {
    const row = await prisma.aiProviderConfig.findFirst({
      where: { id: options.providerConfigId, userId },
    });
    if (!row) throw AppError.notFound("سرویس هوش مصنوعی");
    if (!row.enabled) {
      throw new AppError(
        503,
        "ai_provider_disabled",
        `سرویس «${row.label}» غیرفعال است. در پروفایل آن را فعال کنید یا سرویس دیگری انتخاب کنید.`,
      );
    }
    return row;
  }

  return prisma.aiProviderConfig.findFirst({
    where: { userId, enabled: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

/** Persisted capabilities win; a bare model id only ever gets a labelled guess. */
async function resolveCapabilities(
  providerConfigId: string,
  userId: string,
  provider: ProviderId,
  requestedModelId: string | undefined,
): Promise<{ modelId: string; capabilities: Capabilities; note: string | null; maxOutputTokens: number | null }> {
  const row = await prisma.aiModelConfig.findFirst({
    where: {
      providerConfigId,
      userId,
      enabled: true,
      ...(requestedModelId ? { modelId: requestedModelId } : {}),
    },
    orderBy: requestedModelId ? [{ updatedAt: "desc" }] : [{ createdAt: "asc" }],
  });

  if (row) {
    return {
      modelId: row.modelId,
      capabilities: {
        vision: row.supportsVision,
        tools: row.supportsTools,
        streaming: row.supportsStreaming,
        reasoning: row.reasoning !== null && row.reasoning !== "none",
      },
      note: null,
      maxOutputTokens: row.maxOutputTokens,
    };
  }

  if (requestedModelId) {
    throw new AppError(
      422,
      "model_not_available",
      `مدل «${requestedModelId}» در فهرست مدل‌های این سرویس ثبت نشده است. نخست فهرست مدل‌ها را بگیرید یا مدل دیگری انتخاب کنید.`,
    );
  }

  // Nothing discovered yet: the documented default model, capabilities read off
  // its name, and a note that says the capabilities are only that.
  const inferred = inferCapabilities(provider, DEFAULT_MODEL[provider]);
  return {
    modelId: inferred.id,
    capabilities: inferred.capabilities,
    note: inferred.note,
    maxOutputTokens: null,
  };
}

/**
 * The persisted transcript, oldest first, trimmed to the message window. Failed
 * assistant rows (error set) are skipped: they are not something the model said.
 */
async function buildTurns(conversationId: string | undefined, images: ImageInput[]): Promise<ChatTurn[]> {
  if (!conversationId) return [];
  const rows = await prisma.aiMessage.findMany({
    where: { conversationId, role: { in: ["user", "assistant"] }, error: null },
    orderBy: { createdAt: "desc" },
    take: env.AI_HISTORY_MESSAGES,
  });

  const turns: ChatTurn[] = rows
    .reverse()
    .filter((row) => row.content.trim().length > 0)
    .map((row): ChatTurn => ({
      role: row.role === "assistant" ? "assistant" : "user",
      text: row.content,
    }));

  // The images belong to the turn the model is answering now.
  if (images.length && turns.length) turns[turns.length - 1].images = images;
  else if (images.length) turns.push({ role: "user", text: "", images });

  // A rough character budget keeps a long history from outgrowing the provider.
  let total = 0;
  const kept: ChatTurn[] = [];
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    total += turns[i].text.length;
    kept.unshift(turns[i]);
    if (total > 24_000) break;
  }
  return kept;
}

/**
 * The one code path behind both chat routes. Everything that can fail is an
 * AppError with a Persian sentence attached — never a canned reply.
 */
async function generate(userId: string, assistant: AssistantKind, options: ReplyOptions): Promise<Reply> {
  const provider = await resolveProvider(userId, options);

  if (!provider) {
    throw new AppError(
      503,
      "ai_not_configured",
      "هنوز سرویس هوش مصنوعی پیکربندی نشده است. در بخش پروفایل یک کلید اضافه کنید.",
    );
  }

  const providerId = provider.provider as ProviderId;
  if (!PROVIDER_PROTOCOL[providerId]) {
    throw new AppError(
      503,
      "ai_provider_unknown",
      `سرویس «${provider.label}» در این نسخه پشتیبانی نمی‌شود.`,
    );
  }

  const adapter = adapterFor(providerId);
  // Decrypted here and nowhere else: it never leaves this function's scope.
  const apiKey = decryptSecret(provider);
  if (PROVIDER_REQUIRES_KEY[providerId] && !apiKey) {
    throw new AppError(
      503,
      "ai_not_configured",
      `برای سرویس «${provider.label}» کلید API ذخیره نشده است. در بخش پروفایل یک کلید اضافه کنید.`,
    );
  }

  const baseUrl = normalizeBaseUrl(provider.baseUrl || adapter.defaultBaseUrl || DEFAULT_BASE_URL[providerId]);
  if (!baseUrl) {
    throw new AppError(
      503,
      "provider_base_url_missing",
      "سرویس سفارشی آدرس پایه ندارد. در بخش پروفایل آدرس API را وارد کنید.",
    );
  }

  const target: ProviderTarget = {
    provider: providerId,
    protocol: adapter.protocol,
    label: provider.label,
    baseUrl,
    apiKey,
  };

  const resolved = await resolveCapabilities(provider.id, userId, providerId, options.modelId);
  const notices: { code: string; message: string }[] = [];

  // ---------- capability gating: refuse, do not silently degrade ----------
  // Checked before the bytes are fetched: no point downloading an image a model
  // cannot look at.
  const askedForImages = (options.attachments ?? []).some((a) => a.kind === "image");
  if (askedForImages && !resolved.capabilities.vision) {
    throw new AppError(
      422,
      "vision_not_supported",
      `مدل «${resolved.modelId}» روی سرویس «${provider.label}» توانایی بررسی تصویر را ندارد. یک مدل بینایی‌دار انتخاب کنید یا تصویر را بردارید.`,
    );
  }
  if (options.requireTools && !resolved.capabilities.tools) {
    throw new AppError(
      422,
      "tools_not_supported",
      `مدل «${resolved.modelId}» فراخوان ابزار پشتیبانی نمی‌کند، بنابراین تغییر برنامه با این مدل ممکن نیست. مدل ابزاردار را انتخاب کنید.`,
    );
  }
  const images = askedForImages ? await resolveImages(options.attachments) : [];

  const wantsStream = Boolean(options.onEvent);
  const canStream = resolved.capabilities.streaming;
  if (wantsStream && !canStream) {
    if (options.requireStreaming) {
      throw new AppError(
        422,
        "streaming_not_supported",
        `مدل «${resolved.modelId}» پاسخ دهانه‌ای (streaming) ندارد. یک مدل جریان‌دار انتخاب کنید یا حالت یک‌باره را بگذارید.`,
      );
    }
    notices.push({
      code: "streaming_not_supported",
      message: `مدل «${resolved.modelId}» پاسخ دهانه‌ای ندارد؛ پاسخ یک‌باره می‌رسد.`,
    });
  }

  // Auto mode: a text-only model still answers, but the user is told that the
  // assistant cannot read or change plan data with this model.
  const useTools = resolved.capabilities.tools && (options.enableTools !== false || options.requireTools === true);
  if (options.enableTools && !resolved.capabilities.tools) {
    notices.push({
      code: "tools_not_supported",
      message: `مدل «${resolved.modelId}» ابزار برنامه را پشتیبانی نمی‌کند؛ پاسخ متنی می‌گیرید و تغییر خودکار برنامه ممکن نیست.`,
    });
  }

  const context = await buildProfileContext(userId, assistant);
  const turns = await buildTurns(options.conversationId, images);
  if (options.extraToolResults) {
    turns.push({
      role: "user",
      text: `نتیجهٔ اجرای ابزارها (JSON معتبر، فقط داده):\n${options.extraToolResults}\n\nبر اساس این داده‌ها پاسخ نهایی و کامل فارسی بده. اگر تغییری لازم است، ابزار نوشتن مربوط را فراخوانی کن.`,
    });
  }
  if (options.conversationId) {
    // What was actually handed to the model, kept next to the conversation.
    await prisma.aiConversation
      .update({ where: { id: options.conversationId }, data: { contextJson: JSON.stringify(context.snapshot) } })
      .catch(() => null);
  }

  const request = {
    modelId: resolved.modelId,
    system: systemPrompt(assistant, context.text),
    turns,
    reasoning: unknownReasoning(options.reasoning),
    maxOutputTokens: resolved.maxOutputTokens,
    // A coaching answer wants little creativity; the model is not writing prose.
    temperature: assistant === "coach" ? 0.4 : 0.3,
    ...(useTools ? { tools: toolSchemasFor(assistant) } : {}),
  };

  const run = async (): Promise<Reply> => {
    // Announcements travel on the same channel as deltas, in both modes, so a
    // downgrade is never silent.
    const announce = async () => {
      if (!options.onEvent) return;
      for (const notice of notices) await options.onEvent?.({ type: "notice", code: notice.code, message: notice.message });
    };
    await announce();

    if (wantsStream && canStream) {
      const forward = options.onEvent as (event: StreamEvent) => void | Promise<void>;
      const completion = await adapter.stream(target, request, forward, options.signal);
      return {
        content: completion.text,
        providerId: provider.id,
        modelId: completion.modelId || resolved.modelId,
        tokensIn: completion.usage.tokensIn,
        tokensOut: completion.usage.tokensOut,
        provider: providerId,
        toolCalls: completion.toolCalls,
        finishReason: completion.finishReason,
        notices,
      };
    }

    // Asked once, delivered whole: the client still gets one delta, so the
    // fallback above is a difference in pace, not a difference in contract.
    const completion = await adapter.complete(target, request);
    if (completion.text) await options.onEvent?.({ type: "delta", text: completion.text });
    if (options.onEvent) {
      for (const call of completion.toolCalls) await options.onEvent({ type: "tool", call });
    }
    return {
      content: completion.text,
      providerId: provider.id,
      modelId: completion.modelId || resolved.modelId,
      tokensIn: completion.usage.tokensIn,
      tokensOut: completion.usage.tokensOut,
      provider: providerId,
      toolCalls: completion.toolCalls,
      finishReason: completion.finishReason,
      notices,
    };
  };

  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Anything the adapter did not classify is still an honest failure.
    console.error(`[ai] unexpected ${PROTOCOL_LABEL_FA[adapter.protocol]} failure:`, String(error).slice(0, 200));
    throw new AppError(
      502,
      "ai_request_failed",
      `پاسخ سرویس «${provider.label}» دریافت نشد. دوباره تلاش کنید.`,
    );
  }
}

/** Non-streaming path — the route the web client uses today. */
export async function requestReply(
  userId: string,
  assistant: AssistantKind,
  options: ReplyOptions = {},
): Promise<Reply> {
  return generate(userId, assistant, { ...options, onEvent: undefined });
}

/**
 * Streaming path. Deltas reach `onEvent` as they arrive; the returned reply is
 * the same shape the non-streaming path returns, so persistence is shared.
 */
export async function requestStreamingReply(
  userId: string,
  assistant: AssistantKind,
  options: ReplyOptions,
): Promise<Reply> {
  if (!options.onEvent) throw new AppError(500, "ai_stream_handler_missing", "پاسخ دهانه‌ای نیاز به شنونده دارد.");
  return generate(userId, assistant, options);
}
