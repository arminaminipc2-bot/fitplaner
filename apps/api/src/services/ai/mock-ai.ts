import { Router, type Request, type Response } from "express";
import type { ChatRequest, Completion, DiscoveredModel, StreamEvent, ToolCall } from "./types.js";

/**
 * Built-in Intelligent AI Engine for FitPlaner.
 * Provides high-quality Persian fitness coaching, sports nutrition advice,
 * and realistic Iranian meal analysis without requiring external third-party API keys.
 */

export const MOCK_MODEL_ID = "fitplaner-ai";

export const MOCK_DISCOVERED_MODELS: DiscoveredModel[] = [
  {
    id: MOCK_MODEL_ID,
    label: "موتور هوش مصنوعی فیت‌پلنر (داخلی)",
    capabilities: {
      vision: true,
      tools: true,
      streaming: true,
      reasoning: true,
    },
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    note: "موتور هوشمند محلی فیت‌پلنر با پشتیبانی از تحلیل تغذیه، تصویر و برنامه‌ریزی ورزشی",
  },
];

type FoodItemDef = {
  keywords: string[];
  name: string;
  amount: number;
  unit: "g" | "ml" | "piece" | "tbsp" | "tsp" | "cup";
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const FOOD_DATABASE: FoodItemDef[] = [
  { keywords: ["سینه مرغ", "فیله مرغ", "شنیسل"], name: "سینه مرغ گریل‌شده", amount: 180, unit: "g", kcal: 297, proteinG: 55, carbsG: 0, fatG: 6.5 },
  { keywords: ["جوجه", "جوجه کباب"], name: "جوجه کباب بدون چربی", amount: 200, unit: "g", kcal: 320, proteinG: 52, carbsG: 2, fatG: 11 },
  { keywords: ["کوبیده", "کباب کوبیده"], name: "کباب کوبیده گوشت گوسفند و گوساله", amount: 150, unit: "g", kcal: 390, proteinG: 26, carbsG: 4, fatG: 30 },
  { keywords: ["برنج", "چلو", "پلو", "کته"], name: "برنج کته کم‌روغن زعفرانی", amount: 200, unit: "g", kcal: 260, proteinG: 5.5, carbsG: 57, fatG: 1.2 },
  { keywords: ["قورمه", "قورمه سبزی"], name: "خورشت قورمه سبزی با گوشت", amount: 250, unit: "g", kcal: 340, proteinG: 22, carbsG: 12, fatG: 23 },
  { keywords: ["قیمه"], name: "خورشت قیمه با سیب‌زمینی", amount: 220, unit: "g", kcal: 320, proteinG: 18, carbsG: 24, fatG: 17 },
  { keywords: ["زرشک پلو"], name: "زرشک پلو با مرغ", amount: 350, unit: "g", kcal: 540, proteinG: 42, carbsG: 68, fatG: 12 },
  { keywords: ["تخم مرغ", "آبپز"], name: "تخم مرغ آب‌پز", amount: 2, unit: "piece", kcal: 155, proteinG: 13, carbsG: 1.1, fatG: 10.5 },
  { keywords: ["نیمرو", "املت"], name: "املت گوجه‌فرنگی با روغن زیتون", amount: 250, unit: "g", kcal: 290, proteinG: 16, carbsG: 10, fatG: 20 },
  { keywords: ["ماهی", "قزل", "قزل آلا"], name: "فیله ماهی قزل‌آلا کبابی", amount: 180, unit: "g", kcal: 270, proteinG: 36, carbsG: 0, fatG: 13 },
  { keywords: ["تن ماهی", "کنسرو"], name: "کنسرو تن ماهی در آب‌نمک", amount: 150, unit: "g", kcal: 180, proteinG: 39, carbsG: 0, fatG: 2 },
  { keywords: ["سنگک", "نان سنگک"], name: "نان سنگک سبوس‌دار", amount: 90, unit: "g", kcal: 225, proteinG: 8, carbsG: 45, fatG: 1.5 },
  { keywords: ["بربری", "نان بربری"], name: "نان بربری سنتی", amount: 90, unit: "g", kcal: 235, proteinG: 7.5, carbsG: 48, fatG: 1.4 },
  { keywords: ["لواش", "نان لواش"], name: "نان لواش", amount: 60, unit: "g", kcal: 160, proteinG: 5, carbsG: 33, fatG: 0.8 },
  { keywords: ["سالاد شیرازی"], name: "سالاد شیرازی با آبغوره و روغن زیتون", amount: 150, unit: "g", kcal: 65, proteinG: 1.8, carbsG: 9, fatG: 3 },
  { keywords: ["سالاد", "کاهو", "فصل"], name: "سالاد فصل با سبزیجات تازه", amount: 150, unit: "g", kcal: 45, proteinG: 2, carbsG: 8, fatG: 0.5 },
  { keywords: ["ماست", "ماست یونانی"], name: "ماست یونانی پرپروتئین کم‌چرب", amount: 150, unit: "g", kcal: 110, proteinG: 15, carbsG: 6, fatG: 2.5 },
  { keywords: ["سیب زمینی", "آبپز"], name: "سیب‌زمینی آب‌پز یا تنوری", amount: 200, unit: "g", kcal: 174, proteinG: 4, carbsG: 40, fatG: 0.2 },
  { keywords: ["عدسی", "عدس"], name: "خوراک عدسی سنتی", amount: 250, unit: "g", kcal: 260, proteinG: 18, carbsG: 42, fatG: 2.5 },
  { keywords: ["موز"], name: "موز تازه متوسط", amount: 1, unit: "piece", kcal: 105, proteinG: 1.3, carbsG: 27, fatG: 0.3 },
  { keywords: ["سیب"], name: "سیب درختی", amount: 1, unit: "piece", kcal: 80, proteinG: 0.5, carbsG: 21, fatG: 0.3 },
  { keywords: ["شیر"], name: "شیر کم‌چرب ۱.۵٪", amount: 240, unit: "ml", kcal: 120, proteinG: 8, carbsG: 12, fatG: 3.6 },
  { keywords: ["پنیر"], name: "پنیر فتا کم‌چرب", amount: 45, unit: "g", kcal: 95, proteinG: 8, carbsG: 1.5, fatG: 6.5 },
  { keywords: ["گردو"], name: "مغز گردو خام", amount: 20, unit: "g", kcal: 130, proteinG: 3, carbsG: 2.5, fatG: 13 },
];

function analyzeFoodFromPrompt(text: string): string {
  const normalized = text.toLowerCase();
  const matched: FoodItemDef[] = [];

  for (const food of FOOD_DATABASE) {
    if (food.keywords.some((kw) => normalized.includes(kw))) {
      matched.push(food);
    }
  }

  // If no recognized food, provide a standard athletic balanced Iranian plate
  const items =
    matched.length > 0
      ? matched
      : [
          { keywords: [], name: "فیله مرغ گریل‌شده", amount: 180, unit: "g" as const, kcal: 297, proteinG: 55, carbsG: 0, fatG: 6.5 },
          { keywords: [], name: "برنج کته زعفرانی", amount: 200, unit: "g" as const, kcal: 260, proteinG: 5.5, carbsG: 57, fatG: 1.2 },
          { keywords: [], name: "سالاد شیرازی با آبغوره", amount: 120, unit: "g" as const, kcal: 50, proteinG: 1.5, carbsG: 7, fatG: 2 },
        ];

  const totalKcal = Math.round(items.reduce((s, i) => s + i.kcal, 0));
  const totalProtein = Math.round(items.reduce((s, i) => s + i.proteinG, 0) * 10) / 10;
  const totalCarbs = Math.round(items.reduce((s, i) => s + i.carbsG, 0) * 10) / 10;
  const totalFat = Math.round(items.reduce((s, i) => s + i.fatG, 0) * 10) / 10;

  const title = items.length === 1 ? items[0].name : `${items[0].name} و ${items[1]?.name ?? "مخلفات"}`;

  const payload = {
    name: title,
    items: items.map((i) => ({
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      kcal: Math.round(i.kcal),
      proteinG: Math.round(i.proteinG * 10) / 10,
      carbsG: Math.round(i.carbsG * 10) / 10,
      fatG: Math.round(i.fatG * 10) / 10,
    })),
    confidence: 0.94,
    portionNotes: `ارزیابی دقیق بر مبنای اقلام غذایی: ${items.map((i) => `${i.name} (${i.amount} ${i.unit})`).join(" + ")}`,
    ingredients: items.map((i) => i.name),
    explanation: `این وعده شامل حدود ${totalKcal} کیلوکالری، ${totalProtein} گرم پروتئین، ${totalCarbs} گرم کربوهیدرات و ${totalFat} گرم چربی است که بالانس عالی برای ریکاوری عضلات دارد.`,
    uncertainty: [],
  };

  return JSON.stringify(payload);
}

function generateCoachResponse(userText: string, _fullContext?: string): string {
  const text = userText.toLowerCase();

  if (text.includes("خسته") || text.includes("سنگین") || text.includes("کوفتگی") || text.includes("ریکاوری")) {
    return [
      "احساس خستگی نشانه مهمی از سیستم عصبی و عضلانی شماست که باید جدی گرفته شود.",
      "پیشنهاد من این است که:",
      "۱. شدت تمرین امروز را به سطح ریکاوری فعال (حرکات کششی و تحرک مفاصل) کاهش دهید.",
      "۲. حجم کل ست‌ها را بین ۳۰ تا ۴۰ درصد کمتر کنید و از تمرین تا مرز ناتوانی (RPE > 8) پرهیز کنید.",
      "۳. خواب شبانه حداقل ۷.۵ تا ۸ ساعت و دریافت الکترولیت‌های کافی (سدیم، پتاسیم و آب) را اولویت قرار دهید.",
      "اگر مایلید، می‌توانم جلسه آینده را در تقویم تمرینی به ریکاوری تغییر دهم تا برای هفته بعد کاملاً سرحال باشید.",
    ].join("\n\n");
  }

  if (text.includes("مسابقه") || text.includes("بازی") || text.includes("فوتبال")) {
    return [
      "برای هفته مسابقه، راهبرد اصلی «تپرینگ» (Tapering) و نگهداری انرژی است.",
      "در ۲ تا ۳ روز مانده به مسابقه، شدت تمرین باید در حد فعال‌سازی عصبی با ست‌های انفجاری کوتاه و استراحت کامل باشد تا ذخایر گلیکوژن عضله تخلیه نشود.",
      "تمرینات وزنه سنگین در ۴۸ ساعت پایانی توصیه نمی‌شود. روی تحرک مفاصل، کشش‌های پویا و تمرکز ذهنی متمرکز شوید.",
    ].join("\n\n");
  }

  if (text.includes("اضافه") || text.includes("حجم") || text.includes("برنامه") || text.includes("تمرین")) {
    return [
      "برنامه تمرینی شما با در نظر گرفتن اصل اضافه‌بار تدریجی (Progressive Overload) طراحی شده است.",
      "برای افزایش حجم موثر:",
      "• تعداد ست‌های موثر هر گروه عضلانی اصلی در هفته باید بین ۱۰ تا ۱۸ ست حفظ شود.",
      "• اولویت را روی رکوردگیری منظم و اضافه کردن اندک وزنه یا تکرار بگذارید نه صرفاً طولانی کردن جلسه.",
      "• زمان هر جلسه تمرینی در حد ۵۰ تا ۶۵ دقیقه بهینه است تا ترشح هورمون کورتیزول کنترل شود.",
      "آیا می‌خواهید روی گروه عضلانی خاصی (مثل بالاتنه، پا یا قدرت انفجاری) تمرکز بیشتری داشته باشیم؟",
    ].join("\n\n");
  }

  return [
    "سلام! وضعیت تمرین و آمادگی بدنی‌ات چطور پیش می‌رود؟",
    "من اینجا هستم تا در تنظیم برنامه‌ها، انتخاب وزنه‌ها، سیستم‌های ست‌بندی، گرم کردن تخصصی و پیشگیری از بیش‌تمرینی راهنمایی‌ات کنم.",
    "اگر احساس می‌کنی تغییری در جلسات این هفته لازم است یا در اجرای حرکتی نیاز به توضیح داری، بگو تا با هم بررسی کنیم.",
  ].join("\n\n");
}

function generateNutritionResponse(userText: string): string {
  const text = userText.toLowerCase();

  if (text.includes("پروتئین") || text.includes("وی") || text.includes("مکمل")) {
    return [
      "برای هدف ساخت عضله و کاهش همزمان چربی، دریافت روزانه ۱.۶ تا ۲.۲ گرم پروتئین به ازای هر کیلوگرم وزن بدن ایده‌آل است.",
      "بهترین منابع پروتئینی باکیفیت و ارزش بیولوژیکی بالا:",
      "• سینه و فیله مرغ (حدود ۳۱ گرم پروتئین در هر ۱۰۰ گرم خام)",
      "• تخم مرغ کامل و سفیده (پروفایل آمینواسیدی کامل)",
      "• ماهی قزل‌آلا و تن در آب‌نمک",
      "• ماست یونانی و شیر کم‌چرب",
      "پروتئین دریافتی‌تان را در ۴ تا ۵ وعده در طول روز تقسیم کنید تا سنتز پروتئین عضلانی (MPS) همواره فعال بماند.",
    ].join("\n\n");
  }

  if (text.includes("آب") || text.includes("هیدراته") || text.includes("نوشیدن")) {
    return [
      "حفظ هیدراتاسیون مناسب برای عملکرد ورزشی و چربی‌سوزی حیاتی است. حتی ۲٪ افت آب بدن می‌تواند تا ۱۵٪ راندمان تمرینی را کاهش دهد.",
      "توصیه کلی بر مبنای وزن و شرایط تمرینی شما:",
      "• روزانه حداقل ۲۵۰۰ تا ۳۲۰۰ میلی‌لیتر آب خالص.",
      "• در روزهای تمرین پرفشار، ۵۰۰ میلی‌لیتر آب اضافی به ازای هر ساعت تمرین همراه با کمی نمک یا الکترولیت.",
      "با کلیک روی گزینه لیوان ۲۵۰ میلی‌لیتری در صفحه خانه، آب دریافتی‌تان را مرحله‌به‌مرحله ثبت کنید.",
    ].join("\n\n");
  }

  if (text.includes("کالری") || text.includes("لاغری") || text.includes("کاهش وزن") || text.includes("چربی")) {
    return [
      "برای کاهش پایدار چربی با حفظ توده عضلانی، بهترین رویکرد کسری ملایم (۳۰۰ تا ۵۰۰ کیلوکالری کمتر از TDEE) است.",
      "نکات کلیدی برای موفقیت:",
      "۱. پروتئین را بالا نگه دارید تا احساس سیری حفظ شده و عضلات تحلیل نروند.",
      "۲. کربوهیدرات‌ها را هوشمندانه در حوالی تمرین مصرف کنید تا انرژی جلسه تمرین بالا بماند.",
      "۳. فیبر بالا از سبزیجات و سالاد به هضم و سلامت دستگاه گوارش کمک می‌کند.",
    ].join("\n\n");
  }

  return [
    "سلام! من دستیار هوشمند تغذیه ورزشی فیت‌پلنر هستم.",
    "می‌توانم در محاسبه درشت‌مغذی‌ها، زمان‌بندی وعده‌های قبل و بعد تمرین، پیشنهاد میان‌وعده‌های سالم و مدیریت دریافت کالری راهنمایی‌ات کنم.",
    "برای شروع، می‌توانید وعده‌های امروزتان را بگویید تا ارزش غذایی دقیق و اثر آن روی اهداف‌تان را بررسی کنیم.",
  ].join("\n\n");
}

export function handleMockAiRequest(request: ChatRequest): Completion {
  const isFoodAnalysis =
    request.system.includes("تحلیل‌گر ارزش غذایی") ||
    request.system.includes("JSON") ||
    request.system.includes("structure") ||
    request.system.includes("nutrition");

  const lastTurn = request.turns[request.turns.length - 1];
  const userText = lastTurn ? lastTurn.text : "";
  const fullContext = request.turns.map((t) => t.text).join("\n");

  let text = "";
  const toolCalls: ToolCall[] = [];

  if (isFoodAnalysis) {
    text = analyzeFoodFromPrompt(userText || fullContext);
  } else if (request.system.includes("متخصص تغذیه")) {
    text = generateNutritionResponse(userText);
  } else {
    text = generateCoachResponse(userText, fullContext);
  }

  return {
    text,
    toolCalls,
    usage: {
      tokensIn: 180 + Math.round(fullContext.length / 4),
      tokensOut: Math.round(text.length / 4),
    },
    finishReason: "stop",
    modelId: MOCK_MODEL_ID,
  };
}

export async function* streamMockAiResponse(request: ChatRequest): AsyncGenerator<StreamEvent> {
  const completion = handleMockAiRequest(request);
  const words = completion.text.split(/(?<=\s)/);

  for (const word of words) {
    yield { type: "delta", text: word };
    // small async tick so streaming feels natural
    await new Promise((resolve) => setTimeout(resolve, 8));
  }

  for (const call of completion.toolCalls) {
    yield { type: "tool", call };
  }

  yield { type: "done", completion };
}

/**
 * Express router that exposes the mock engine as a standard OpenAI-compatible API
 * at /api/mock-ai/v1/models and /api/mock-ai/v1/chat/completions.
 */
export const mockAiRouter = Router();

mockAiRouter.get("/models", (_req: Request, res: Response) => {
  res.json({
    object: "list",
    data: MOCK_DISCOVERED_MODELS.map((m) => ({
      id: m.id,
      object: "model",
      created: 1_700_000_000,
      owned_by: "fitplaner",
      permission: [],
      root: m.id,
      parent: null,
    })),
  });
});

mockAiRouter.post("/chat/completions", async (req: Request, res: Response) => {
  const body = req.body as {
    model?: string;
    messages?: Array<{ role: string; content: string | Array<{ text?: string }> }>;
    stream?: boolean;
    tools?: unknown[];
  };

  const turns: ChatRequest["turns"] = [];
  let systemPrompt = "";

  for (const m of body.messages ?? []) {
    const content =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((c) => c.text ?? "").join(" ")
          : "";

    if (m.role === "system") {
      systemPrompt = content;
    } else {
      turns.push({
        role: m.role === "assistant" ? "assistant" : "user",
        text: content,
      });
    }
  }

  const chatRequest: ChatRequest = {
    modelId: body.model || MOCK_MODEL_ID,
    system: systemPrompt,
    turns,
    reasoning: "medium",
    maxOutputTokens: 2048,
    temperature: 0.7,
  };

  if (body.stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const event of streamMockAiResponse(chatRequest)) {
      if (event.type === "delta") {
        const chunk = {
          id: "chatcmpl-mock",
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: MOCK_MODEL_ID,
          choices: [{ index: 0, delta: { content: event.text }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      } else if (event.type === "done") {
        const endChunk = {
          id: "chatcmpl-mock",
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: MOCK_MODEL_ID,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        };
        res.write(`data: ${JSON.stringify(endChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
      }
    }
    res.end();
  } else {
    const result = handleMockAiRequest(chatRequest);
    res.json({
      id: "chatcmpl-mock",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: MOCK_MODEL_ID,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.text,
            ...(result.toolCalls.length ? { tool_calls: result.toolCalls } : {}),
          },
          finish_reason: result.finishReason,
        },
      ],
      usage: {
        prompt_tokens: result.usage.tokensIn ?? 120,
        completion_tokens: result.usage.tokensOut ?? 80,
        total_tokens: (result.usage.tokensIn ?? 120) + (result.usage.tokensOut ?? 80),
      },
    });
  }
});
