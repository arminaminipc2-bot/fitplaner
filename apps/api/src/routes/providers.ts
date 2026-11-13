import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { PROVIDER, zProvider } from "../domain.js";
import { AppError, ok, parseBody, uid } from "../http.js";
import { decryptSecret, encryptSecret, maskSecret } from "../secrets.js";
import { adapterFor, verifyTarget } from "../services/ai/adapters.js";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  MODEL_LIST_PATH,
  normalizeBaseUrl,
  PROTOCOL_LABEL_FA,
  PROVIDER_PROTOCOL,
  PROVIDER_REQUIRES_KEY,
} from "../services/ai/capabilities.js";
import type { DiscoveredModel, ProviderId, ProviderTarget } from "../services/ai/types.js";
import { faNumber } from "../text.js";

export const providerRouter = Router();

/**
 * Per-user provider configuration. The plaintext key is written once and never
 * read back out of this API: responses carry the mask only (spec §13.5).
 */
function serialize(p: {
  id: string;
  provider: string;
  label: string;
  baseUrl: string | null;
  keyMask: string | null;
  enabled: boolean;
  isDefault: boolean;
  createdAt: Date;
}) {
  return {
    id: p.id,
    provider: p.provider,
    label: p.label,
    baseUrl: p.baseUrl,
    hasKey: Boolean(p.keyMask),
    keyMask: p.keyMask,
    enabled: p.enabled,
    isDefault: p.isDefault,
    createdAt: p.createdAt.toISOString(),
  };
}

/** Resolved endpoint + decrypted key for one row of *this* user. */
async function targetFor(userId: string, id: string): Promise<{ target: ProviderTarget; rowId: string }> {
  const row = await prisma.aiProviderConfig.findFirst({ where: { id, userId } });
  if (!row) throw AppError.notFound("سرویس هوش مصنوعی");

  const provider = row.provider as ProviderId;
  const protocol = PROVIDER_PROTOCOL[provider];
  if (!protocol) {
    throw new AppError(503, "ai_provider_unknown", `سرویس «${row.label}» در این نسخه پشتیبانی نمی‌شود.`);
  }

  const adapter = adapterFor(provider);
  // Decrypting here means the plaintext never leaves this function.
  const apiKey = decryptSecret(row);
  if (PROVIDER_REQUIRES_KEY[provider] && !apiKey) {
    throw new AppError(
      503,
      "ai_not_configured",
      `برای سرویس «${row.label}» کلید API ذخیره نشده است. در بخش پروفایل یک کلید اضافه کنید.`,
    );
  }

  const baseUrl = normalizeBaseUrl(row.baseUrl || adapter.defaultBaseUrl || DEFAULT_BASE_URL[provider]);
  if (!baseUrl) {
    throw new AppError(
      503,
      "provider_base_url_missing",
      "سرویس سفارشی آدرس پایه ندارد. در بخش پروفایل آدرس API را وارد کنید.",
    );
  }

  return {
    rowId: row.id,
    target: { provider, protocol, label: row.label, baseUrl, apiKey },
  };
}

const createSchema = z.object({
  provider: zProvider,
  label: z.string().trim().min(1).max(60),
  baseUrl: z
    .string()
    .url()
    .max(200)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  apiKey: z.string().min(8).max(400).optional(),
  enabled: z.boolean().default(true),
});

providerRouter.get("/", async (req, res) => {
  const items = await prisma.aiProviderConfig.findMany({
    where: { userId: uid(req) },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  ok(res, { items: items.map(serialize), providers: PROVIDER });
});

providerRouter.post("/", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(createSchema, req.body);

  const secret = body.apiKey ? { ...encryptSecret(body.apiKey), keyMask: maskSecret(body.apiKey) } : null;
  const first = (await prisma.aiProviderConfig.count({ where: { userId } })) === 0;

  const created = await prisma.aiProviderConfig.create({
    data: {
      userId,
      provider: body.provider,
      label: body.label,
      baseUrl: body.baseUrl ?? (DEFAULT_BASE_URL[body.provider as ProviderId] || null),
      enabled: body.enabled,
      isDefault: first,
      keyCipher: secret?.keyCipher ?? null,
      keyIv: secret?.keyIv ?? null,
      keyMask: secret?.keyMask ?? null,
    },
  });

  ok(res, serialize(created), 201);
});

providerRouter.patch("/:id", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(
    z.object({
      label: createSchema.shape.label.optional(),
      baseUrl: createSchema.shape.baseUrl.optional(),
      apiKey: createSchema.shape.apiKey.optional(),
      enabled: z.boolean().optional(),
      isDefault: z.boolean().optional(),
    }),
    req.body,
  );

  const current = await prisma.aiProviderConfig.findFirst({ where: { id: req.params.id, userId } });
  if (!current) throw AppError.notFound("سرویس هوش مصنوعی");

  const secret = body.apiKey ? { ...encryptSecret(body.apiKey), keyMask: maskSecret(body.apiKey) } : null;

  if (body.isDefault) {
    await prisma.aiProviderConfig.updateMany({ where: { userId }, data: { isDefault: false } });
  }

  const updated = await prisma.aiProviderConfig.update({
    where: { id: current.id },
    data: {
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl ?? null } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      ...(secret
        ? { keyCipher: secret.keyCipher, keyIv: secret.keyIv, keyMask: secret.keyMask }
        : {}),
    },
  });

  ok(res, serialize(updated));
});

providerRouter.delete("/:id", async (req, res) => {
  const userId = uid(req);
  const deleted = await prisma.aiProviderConfig.deleteMany({ where: { id: req.params.id, userId } });
  if (deleted.count === 0) throw AppError.notFound("سرویس هوش مصنوعی");
  ok(res, { deleted: true });
});

// ---------- model discovery ----------

function serializeModel(m: {
  id: string;
  modelId: string;
  displayName: string | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsAudio: boolean;
  reasoning: string | null;
  enabled: boolean;
}) {
  return {
    id: m.id,
    modelId: m.modelId,
    displayName: m.displayName,
    capabilities: {
      vision: m.supportsVision,
      tools: m.supportsTools,
      streaming: m.supportsStreaming,
      reasoning: m.reasoning !== null && m.reasoning !== "none",
      audio: m.supportsAudio,
    },
    contextWindow: m.contextWindow,
    maxOutputTokens: m.maxOutputTokens,
    reasoning: m.reasoning,
    enabled: m.enabled,
  };
}

/**
 * `?source=local` reads what is already stored — no provider call, no key use.
 * Otherwise the provider's own list endpoint is asked and the answer is merged
 * into AiModelConfig for this row only.
 */
providerRouter.get("/:id/models", async (req, res) => {
  const userId = uid(req);
  const source = req.query.source === "local" ? "local" : "provider";

  const { target, rowId } = await targetFor(userId, req.params.id);

  if (source === "local") {
    const stored = await prisma.aiModelConfig.findMany({
      where: { providerConfigId: rowId, userId },
      orderBy: { modelId: "asc" },
    });
    ok(res, {
      items: stored.map(serializeModel),
      source: "local",
      protocol: target.protocol,
      listEndpoint: MODEL_LIST_PATH[target.protocol] ?? null,
      note: "from_local_cache",
    });
    return;
  }

  const adapter = adapterFor(target.provider);
  const discovered: DiscoveredModel[] = await adapter.listModels(target);

  // Merged per row, never across accounts: the unique key is (providerConfigId, modelId).
  for (const model of discovered) {
    await prisma.aiModelConfig.upsert({
      where: {
        providerConfigId_modelId: { providerConfigId: rowId, modelId: model.id },
      },
      create: {
        providerConfigId: rowId,
        userId,
        modelId: model.id,
        displayName: model.label,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        supportsVision: model.capabilities.vision,
        supportsTools: model.capabilities.tools,
        supportsStreaming: model.capabilities.streaming,
        reasoning: model.capabilities.reasoning ? "medium" : "none",
      },
      update: {
        displayName: model.label,
        ...(model.contextWindow !== null ? { contextWindow: model.contextWindow } : {}),
        ...(model.maxOutputTokens !== null ? { maxOutputTokens: model.maxOutputTokens } : {}),
        supportsVision: model.capabilities.vision,
        supportsTools: model.capabilities.tools,
        supportsStreaming: model.capabilities.streaming,
        reasoning: model.capabilities.reasoning ? "medium" : "none",
      },
    });
  }

  const stored = await prisma.aiModelConfig.findMany({
    where: { providerConfigId: rowId, userId },
    orderBy: { modelId: "asc" },
  });

  const notes = new Map(discovered.map((m) => [m.id, m.note]));
  ok(res, {
    items: stored.map((m) => ({
      ...serializeModel(m),
      // The provenance cannot be stored (no column for it), so it travels here.
      note: notes.get(m.modelId) ?? "capabilities_inferred_from_model_name",
    })),
    source: "provider",
    protocol: target.protocol,
    protocolLabel: PROTOCOL_LABEL_FA[target.protocol],
    listEndpoint: `${target.baseUrl}${MODEL_LIST_PATH[target.protocol] ?? ""}`,
    reportedCount: discovered.length,
    note:
      discovered.length === 0
        ? "provider_returned_no_models"
        : "capabilities_are_reported_only_when_the_provider_states_them",
  });
});

// ---------- verification ----------

/**
 * Cheapest authenticated round-trip for a row. Provider-side failures come back
 * as a 200 with `ok: false` and a Persian summary, because the point of this
 * endpoint is to explain the failure — never a key, mask or raw provider body.
 */
providerRouter.post("/:id/verify", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(
    z.object({ modelId: z.string().min(1).max(120).optional() }),
    req.body,
  );

  const { target } = await targetFor(userId, req.params.id);

  const started = Date.now();
  try {
    const result = await verifyTarget(target, body.modelId ?? DEFAULT_MODEL[target.provider]);
    ok(res, {
      ok: true,
      code: "provider_ok",
      provider: target.provider,
      protocol: target.protocol,
      method: result.method,
      latencyMs: Date.now() - started,
      message:
        result.method === "model_list"
          ? `کلید سرویس «${target.label}» کار می‌کند؛ ${faNumber(result.models)} مدل یافت شد.`
          : `کلید سرویس «${target.label}» کار می‌کند؛ یک پاسخ آزمایشی دریافت شد.`,
    });
  } catch (error) {
    if (!(error instanceof AppError)) {
      console.error(`[ai] verify crashed for ${target.provider}: ${String(error).slice(0, 160)}`);
    }
    const failure =
      error instanceof AppError
        ? error
        : new AppError(502, "ai_request_failed", `آزمون سرویس «${target.label}» کامل نشد.`);
    ok(res, {
      ok: false,
      code: failure.code,
      provider: target.provider,
      protocol: target.protocol,
      method: "model_list",
      latencyMs: Date.now() - started,
      message: failure.message,
    });
  }
});
