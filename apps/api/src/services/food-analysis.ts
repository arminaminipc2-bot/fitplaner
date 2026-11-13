import { z } from "zod";
import { prisma } from "../db.js";
import { AppError } from "../http.js";
import { decryptSecret } from "../secrets.js";
import { buildProfileContext } from "./ai/context.js";
import {
  DEFAULT_BASE_URL,
  normalizeBaseUrl,
  PROVIDER_REQUIRES_KEY,
} from "./ai/capabilities.js";
import { adapterFor } from "./ai/adapters.js";
import { resolveImages, type AttachmentRef } from "./ai/images.js";
import type { ProviderId, ProviderTarget, Reasoning } from "./ai/types.js";

/**
 * Photo / text / transcript → a nutrition estimate the user confirms. The answer
 * is parsed and range-checked server-side; totals are recomputed from the items
 * so a model cannot return numbers that disagree with its own breakdown.
 */

const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().min(0.1).max(5000),
  unit: z.enum(["g", "ml", "piece", "tbsp", "tsp", "cup"]),
  kcal: z.number().min(0).max(9000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(1000),
});

const modelAnswerSchema = z.object({
  name: z.string().trim().max(120).optional(),
  items: z.array(itemSchema).max(20),
  confidence: z.number().min(0).max(1).optional(),
  portionNotes: z.string().trim().max(600).optional(),
  ingredients: z.array(z.string().trim().max(80)).max(30).optional(),
  explanation: z.string().trim().max(1200).optional(),
  uncertainty: z.array(z.string().trim().max(200)).max(12).optional(),
});

export type FoodEstimate = {
  name: string;
  items: z.infer<typeof itemSchema>[];
  totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  confidence: number;
  portionNotes: string | null;
  ingredients: string[];
  explanation: string;
  uncertainty: string[];
  source: "ai_text" | "ai_photo" | "ai_voice";
  providerLabel: string;
  modelId: string;
};

const SYSTEM = [
  "تو یک تحلیل‌گر ارزش غذایی فارسی‌زبان هستی. ورودی می‌تواند عکس غذا، متن یا رونوشت گفتار باشد.",
  "فقط یک شیء JSON معتبر برگردان؛ هیچ متن دیگری، هیچ بلوک کد و هیچ توضیح بیرونی ننویس.",
  "ساختار دقیق:",
  '{"name":"نام کوتاه وعده","items":[{"name":"نام غذا","amount":عدد,"unit":"g|ml|piece|tbsp|tsp|cup","kcal":عدد,"proteinG":عدد,"carbsG":عدد,"fatG":عدد}],"confidence":عدد بین ۰ و ۱,"portionNotes":"توضیح تخمین حجم","ingredients":["..."],"explanation":"توضیح فارسی کوتاه","uncertainty":["..."]}',
  "قواعد مهم:",
  "- این یک تخمین است، نه اندازه‌گیری. اگر حجم یا مادهٔ اولیه معلوم نیست، در uncertainty بنویس.",
  "- برای غذاهای ایرانی از مقدارهای واقع‌بینانه استفاده کن (مثلاً یک کف دست نان سنگک، یک لیوان برنج پخته).",
  "- مجموع کالری و درشت‌مغذی‌ها باید با اقلام هم‌خوان باشد.",
  "- اگر در تصویر غذای قابل تشخیصی نیست، items را خالی بگذار و confidence را ۰ کن.",
  "- هیچ ادعای پزشکی یا تشخیصی نکن. برای محدودیت غذایی یا حساسیت، فقط تذکر بده که برچسب مواد بررسی شود.",
].join("\n");

function parseJsonAnswer(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Some models wrap the object in one sentence; take the outermost braces.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Resolves the provider/model for analysis. Vision models are required for an
 * image; a text model is fine for text or a voice transcript.
 */
async function resolveAnalyzer(userId: string, needsVision: boolean, providerConfigId?: string, modelId?: string) {
  const provider = providerConfigId
    ? await prisma.aiProviderConfig.findFirst({ where: { id: providerConfigId, userId } })
    : await prisma.aiProviderConfig.findFirst({
        where: { userId, enabled: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });

  if (!provider || !provider.enabled) {
    throw new AppError(
      503,
      "ai_not_configured",
      "برای تحلیل غذا، یک سرویس هوش مصنوعی فعال با کلید در بخش تنظیمات اضافه کنید.",
    );
  }

  const providerId = provider.provider as ProviderId;
  const modelRow = modelId
    ? await prisma.aiModelConfig.findFirst({
        where: { providerConfigId: provider.id, userId, enabled: true, modelId },
      })
    : await prisma.aiModelConfig.findFirst({
        where: {
          providerConfigId: provider.id,
          userId,
          enabled: true,
          ...(needsVision ? { supportsVision: true } : {}),
        },
        orderBy: [{ supportsVision: "desc" }, { createdAt: "asc" }],
      });

  if (modelId && !modelRow) {
    throw new AppError(
      422,
      "model_not_available",
      "این مدل در فهرست مدل‌های سرویس ثبت نشده است. فهرست مدل‌ها را دوباره بگیرید.",
    );
  }

  if (needsVision && !modelRow) {
    throw new AppError(
      422,
      "vision_not_supported",
      `روی سرویس «${provider.label}» مدل بینایی‌داری ثبت نشده است. یک مدل با قابلیت تصویر انتخاب و فهرست مدل‌ها را به‌روز کنید.`,
    );
  }

  if (needsVision && modelRow && !modelRow.supportsVision) {
    throw new AppError(
      422,
      "vision_not_supported",
      `مدل «${modelRow.modelId}» قابلیت بررسی تصویر ندارد. مدل بینایی‌دار انتخاب کنید یا وعده را متنی توضیح دهید.`,
    );
  }

  const apiKey = decryptSecret(provider);
  if (PROVIDER_REQUIRES_KEY[providerId] && !apiKey) {
    throw new AppError(
      503,
      "ai_not_configured",
      `برای سرویس «${provider.label}» کلید API ذخیره نشده است.`,
    );
  }

  const adapter = adapterFor(providerId);
  const baseUrl = normalizeBaseUrl(provider.baseUrl || adapter.defaultBaseUrl || DEFAULT_BASE_URL[providerId]);
  if (!baseUrl) {
    throw new AppError(503, "provider_base_url_missing", "آدرس پایهٔ این سرویس تنظیم نشده است.");
  }

  const target: ProviderTarget = {
    provider: providerId,
    protocol: adapter.protocol,
    label: provider.label,
    baseUrl,
    apiKey,
  };

  // No discovered model row: use the documented default, which is a labelled guess.
  const resolvedModel = modelRow?.modelId ?? "gpt-4o-mini";
  return { target, adapter, provider, resolvedModel };
}

export async function analyzeFood(
  userId: string,
  input: {
    text?: string;
    image?: string;
    source?: "ai_text" | "ai_voice" | "ai_photo";
    providerConfigId?: string;
    modelId?: string;
    reasoning?: Reasoning;
  },
): Promise<FoodEstimate> {
  const text = input.text?.trim() ?? "";
  const attachments: AttachmentRef[] = input.image ? [{ kind: "image", ref: input.image }] : [];
  if (!text && attachments.length === 0) {
    throw AppError.validation({ text: "یک توضیح یا تصویر غذا لازم است." });
  }

  const needsVision = attachments.length > 0;
  const { target, adapter, provider, resolvedModel } = await resolveAnalyzer(
    userId,
    needsVision,
    input.providerConfigId,
    input.modelId,
  );

  const images = needsVision ? await resolveImages(attachments) : [];
  const context = await buildProfileContext(userId, "nutritionist");

  const userText = [
    text ? `توضیح کاربر: ${text}` : "تصویر غذا را تحلیل کن.",
    context.text
      ? `زمینهٔ کاربر برای محدودیت‌ها (فقط برای هشدار، نه تشخیص):\n${context.text}`
      : "",
    "فقط JSON بده.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let completion;
  try {
    completion = await adapter.complete(target, {
      modelId: resolvedModel,
      system: SYSTEM,
      turns: [{ role: "user", text: userText, ...(images.length ? { images } : {}) }],
      reasoning: input.reasoning ?? "none",
      maxOutputTokens: 1400,
      temperature: 0.2,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      502,
      "ai_request_failed",
      `تحلیل غذا با سرویس «${provider.label}» انجام نشد. دوباره تلاش کنید.`,
    );
  }

  const parsed = modelAnswerSchema.safeParse(parseJsonAnswer(completion.text));
  if (!parsed.success) {
    throw new AppError(
      502,
      "ai_invalid_response",
      "پاسخ مدل ساختار قابل استناد نداشت. دوباره تلاش کنید یا توضیح وعده را واضح‌تر بنویسید.",
    );
  }

  const answer = parsed.data;
  if (answer.items.length === 0) {
    throw new AppError(
      422,
      "food_not_recognized",
      "غذایی در این ورودی شناسایی نشد. یک تصویر واضح‌تر بفرستید یا وعده را متنی توضیح دهید.",
    );
  }

  const totals = {
    kcal: round(answer.items.reduce((s, i) => s + i.kcal, 0)),
    proteinG: round(answer.items.reduce((s, i) => s + i.proteinG, 0)),
    carbsG: round(answer.items.reduce((s, i) => s + i.carbsG, 0)),
    fatG: round(answer.items.reduce((s, i) => s + i.fatG, 0)),
  };

  // A large gap between stated kcal and macro energy is surfaced, not hidden.
  const macroKcal = totals.proteinG * 4 + totals.carbsG * 4 + totals.fatG * 9;
  const uncertainty = [...(answer.uncertainty ?? [])];
  if (macroKcal > 0 && totals.kcal > 0) {
    const gap = Math.abs(macroKcal - totals.kcal) / totals.kcal;
    if (gap > 0.35) {
      uncertainty.push("بین کالری کل و انرژی درشت‌مغذی‌ها اختلاف محسوسی وجود دارد؛ اعداد را بازبینی کنید.");
    }
  }

  const source = input.source ?? (needsVision ? "ai_photo" : "ai_text");

  return {
    name: answer.name?.trim() || (text ? text.slice(0, 80) : "وعدهٔ تحلیل‌شده"),
    items: answer.items.map((i) => ({ ...i, name: i.name.trim() })),
    totals,
    // An estimate without a model confidence is low-confidence by definition.
    confidence: answer.confidence ?? 0.5,
    portionNotes: answer.portionNotes?.trim() || null,
    ingredients: answer.ingredients ?? [],
    explanation:
      answer.explanation?.trim() ||
      "ارزش غذایی بر اساس تخمین مدل بینایی و اقلام شناسایی‌شده محاسبه شده است.",
    uncertainty,
    source,
    providerLabel: provider.label,
    modelId: completion.modelId || resolvedModel,
  };
}
