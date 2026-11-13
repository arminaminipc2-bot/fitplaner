import { prisma } from "../../db.js";
import { AppError } from "../../http.js";
import { addDays, tehranDate } from "../../time.js";
import type { ToolCall, ToolSchema } from "./types.js";
import type { AssistantKind } from "./context.js";

/**
 * The only tools an assistant can ask for. Read tools run immediately; every
 * write tool is turned into a *proposal* (PlanChange) and never touches a row
 * from here. Names and arguments are validated with zod at the boundary.
 */

const exerciseSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "نام حرکت، مثلاً اسکات با هالتر" },
    muscleGroup: { type: "string", description: "گروه عضلانی هدف" },
    equipment: { type: "string", description: "تجهیزات لازم" },
    sets: { type: "integer", minimum: 1, maximum: 20, description: "تعداد ست" },
    reps: { type: "string", description: "تکرار، مثلاً ۸ تا ۱۲" },
    restSeconds: { type: "integer", minimum: 0, maximum: 900, description: "استراحت بین ست‌ها" },
    notes: { type: "string", description: "توضیح اجرا یا نکتهٔ ایمنی" },
  },
  required: ["name", "sets", "reps"],
} as const;

const workoutFields = {
  date: { type: "string", description: "تاریخ میلادی YYYY-MM-DD" },
  kind: {
    type: "string",
    enum: ["strength", "cardio", "football", "speed", "recovery", "rest", "match"],
  },
  title: { type: "string" },
  intensity: { type: "string", enum: ["low", "moderate", "high", "max"] },
  estimatedMinutes: { type: "integer", minimum: 5, maximum: 600 },
  exercises: { type: "array", items: exerciseSchema, maxItems: 40 },
} as const;

const mealItemSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    amount: { type: "number", minimum: 0.1, maximum: 5000 },
    unit: { type: "string", enum: ["g", "ml", "piece", "tbsp", "tsp", "cup"] },
    kcal: { type: "number", minimum: 0, maximum: 9000 },
    proteinG: { type: "number", minimum: 0, maximum: 1000 },
    carbsG: { type: "number", minimum: 0, maximum: 1000 },
    fatG: { type: "number", minimum: 0, maximum: 1000 },
  },
  required: ["name", "amount", "unit", "kcal", "proteinG", "carbsG", "fatG"],
} as const;

const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolSchema => ({
  name,
  description,
  parametersJson: JSON.stringify({ type: "object", properties, required, additionalProperties: false }),
});

const READ_TOOLS: ToolSchema[] = [
  tool("get_user_profile", "خواندن پروفایل شخصی، هدف‌ها و سابقهٔ کوتاه. برای شخصی‌سازی پاسخ.", {}),
  tool("get_body_measurements", "آخرین اندازه‌گیری‌های بدن و روند وزن.", {
    metrics: { type: "array", items: { type: "string" }, maxItems: 12 },
  }),
  tool("get_training_history", "تاریخ تمرین‌های اخیر با وضعیت، حجم و RPE جلسات.", {
    days: { type: "integer", minimum: 7, maximum: 365 },
  }),
  tool("get_weekly_plan", "برنامهٔ تمرین و هدف غذایی همان هفته.", {
    weekStart: { type: "string", description: "شنبهٔ هفته، YYYY-MM-DD. خالی یعنی هفتهٔ جاری." },
  }),
  tool("get_daily_nutrition", "وعده‌ها، آب و هدف غذایی یک روز.", {
    date: { type: "string", description: "YYYY-MM-DD؛ خالی یعنی امروز." },
  }),
  tool("get_progress_data", "روند وزن، کالری، تمرین و داده‌های پیشرفت.", {
    days: { type: "integer", minimum: 7, maximum: 730 },
  }),
];

const COACH_WRITE_TOOLS: ToolSchema[] = [
  tool("update_weekly_plan", "پیشنهاد اصلاح برنامهٔ یک هفته: هر روزی که می‌دهی جایگزین یا ساخته می‌شود. روزهای ذکرشده نباید تکمیل‌شده باشند.", {
    summary: { type: "string", description: "خلاصهٔ فارسی تغییر برای نمایش به کاربر" },
    days: {
      type: "array",
      minItems: 1,
      maxItems: 7,
      items: {
        type: "object",
        properties: workoutFields,
        required: ["date", "kind", "title"],
      },
    },
  }, ["summary", "days"]),
  tool("create_workout", "پیشنهاد افزودن یک تمرین به تقویم.", {
    summary: { type: "string" },
    ...workoutFields,
  }, ["date", "kind", "title"]),
  tool("edit_workout", "پیشنهاد ویرایش یک تمرین موجود.", {
    summary: { type: "string" },
    workoutId: { type: "string" },
    date: workoutFields.date,
    kind: workoutFields.kind,
    title: workoutFields.title,
    intensity: workoutFields.intensity,
    estimatedMinutes: workoutFields.estimatedMinutes,
    description: { type: "string" },
    exercises: workoutFields.exercises,
  }, ["workoutId"]),
  tool("reschedule_workout", "پیشنهاد جابه‌جایی یک تمرین به تاریخ دیگر.", {
    summary: { type: "string" },
    workoutId: { type: "string" },
    date: { type: "string" },
  }, ["workoutId", "date"]),
  tool("delete_workout", "پیشنهاد حذف یک تمرین. کار برگشت‌پذیر است ولی نیاز به تأیید دارد.", {
    summary: { type: "string" },
    workoutId: { type: "string" },
  }, ["workoutId"]),
];

const NUTRITION_WRITE_TOOLS: ToolSchema[] = [
  tool("update_nutrition_targets", "پیشنهاد هدف کالری و درشت‌مغذی‌ها برای یک تاریخ مؤثر.", {
    summary: { type: "string" },
    kcal: { type: "number", minimum: 1000, maximum: 6000 },
    proteinG: { type: "number", minimum: 0, maximum: 400 },
    carbsG: { type: "number", minimum: 0, maximum: 800 },
    fatG: { type: "number", minimum: 0, maximum: 400 },
    waterMl: { type: "integer", minimum: 500, maximum: 8000 },
    effectiveFrom: { type: "string", description: "YYYY-MM-DD؛ خالی یعنی امروز" },
  }, ["summary", "kcal", "proteinG", "carbsG", "fatG"]),
  tool("add_meal", "پیشنهاد ثبت یک وعده با اقلام و ارزش غذایی.", {
    summary: { type: "string" },
    date: { type: "string" },
    slot: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
    name: { type: "string" },
    items: { type: "array", items: mealItemSchema, minItems: 1, maxItems: 40 },
  }, ["date", "slot", "name", "items"]),
  tool("update_meal", "پیشنهاد ویرایش یک وعدهٔ ثبت‌شده.", {
    summary: { type: "string" },
    mealId: { type: "string" },
    name: { type: "string" },
    slot: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
    items: { type: "array", items: mealItemSchema, maxItems: 40 },
  }, ["mealId"]),
  tool("delete_meal", "پیشنهاد حذف یک وعده.", {
    summary: { type: "string" },
    mealId: { type: "string" },
  }, ["mealId"]),
];

const SHARED_READS = ["get_user_profile", "get_body_measurements", "get_weekly_plan", "get_training_history", "get_daily_nutrition", "get_progress_data"];

export function toolSchemasFor(assistant: AssistantKind): ToolSchema[] {
  const reads = READ_TOOLS.filter((t) => SHARED_READS.includes(t.name));
  return [...reads, ...(assistant === "coach" ? COACH_WRITE_TOOLS : NUTRITION_WRITE_TOOLS)];
}

/** Reads are the only calls chat may execute without a confirmation step. */
export const READ_TOOL_NAMES = new Set(READ_TOOLS.map((t) => t.name));

export function isReadTool(name: string): boolean {
  return READ_TOOL_NAMES.has(name);
}

export const WRITE_TOOLS = new Set([
  ...COACH_WRITE_TOOLS.map((t) => t.name),
  ...NUTRITION_WRITE_TOOLS.map((t) => t.name),
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

/** The assistant each write tool belongs to — used to refuse cross-role writes. */
export function writeToolOwner(name: string): AssistantKind | null {
  if (COACH_WRITE_TOOLS.some((t) => t.name === name)) return "coach";
  if (NUTRITION_WRITE_TOOLS.some((t) => t.name === name)) return "nutritionist";
  return null;
}

// ---------- read side ----------

function parseArgs(call: ToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(call.argumentsJson || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new AppError(422, "tool_arguments_invalid", "دستیار آرگومان معتبری برای ابزار نفرستاد.");
  }
}

const num = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** 0 = شنبه … 6 = جمعه — the same week the UI draws. */
export function persianDayIndex(day: Date): number {
  return (day.getUTCDay() + 1) % 7;
}

export function currentWeekStart(today = new Date(`${tehranDate()}T00:00:00.000Z`)): Date {
  return addDays(today, -persianDayIndex(today));
}

/** A day string from the model, or the fallback — never an invalid date. */
function dayOr(value: unknown, fallback: string): Date {
  const text = str(value);
  const candidate = text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00.000Z`) : null;
  if (candidate && !Number.isNaN(candidate.getTime())) return candidate;
  return new Date(`${fallback}T00:00:00.000Z`);
}

/**
 * Read tools run against the caller's own rows only. Their output is compact:
 * a model does not need every column, and a smaller payload is a cheaper turn.
 */
export async function executeReadTool(userId: string, call: ToolCall): Promise<unknown> {
  const args = parseArgs(call);

  switch (call.name) {
    case "get_user_profile": {
      const [profile, goals] = await Promise.all([
        prisma.profile.findUnique({ where: { userId } }),
        prisma.fitnessGoal.findMany({ where: { userId, status: "active" }, take: 8 }),
      ]);
      return {
        displayName: profile?.displayName ?? null,
        sex: profile?.sex ?? null,
        birthDate: profile?.birthDate ? profile.birthDate.toISOString().slice(0, 10) : null,
        heightCm: profile?.heightCm ?? null,
        activityLevel: profile?.activityLevel ?? null,
        trainingExperience: profile?.trainingExperience ?? null,
        maxWorkoutMinutes: profile?.maxWorkoutMinutes ?? null,
        trainingDays: profile?.trainingDays ? safeJson(profile.trainingDays) : null,
        equipmentNotes: profile?.equipmentNotes ?? null,
        injuries: profile?.injuries ?? null,
        dietaryRestrictions: profile?.dietaryRestrictions ?? null,
        preferredFoods: profile?.preferredFoods ?? null,
        dislikedFoods: profile?.dislikedFoods ?? null,
        goals: goals.map((g) => ({ type: g.type, targetValue: g.targetValue, unit: g.unit, targetDate: g.targetDate })),
      };
    }

    case "get_body_measurements": {
      const wanted = Array.isArray(args.metrics)
        ? args.metrics.filter((m): m is string => typeof m === "string").slice(0, 12)
        : null;
      const rows = await prisma.bodyMeasurement.findMany({
        where: { userId, ...(wanted?.length ? { metric: { in: wanted } } : {}) },
        orderBy: { takenAt: "desc" },
        take: 80,
      });
      const latest = new Map<string, (typeof rows)[number]>();
      for (const row of rows) if (!latest.has(row.metric)) latest.set(row.metric, row);
      return {
        latest: [...latest.values()].map((m) => ({
          metric: m.metric,
          value: m.value,
          unit: m.unit,
          takenAt: m.takenAt.toISOString().slice(0, 10),
          quality: m.quality,
        })),
        weightHistory: rows
          .filter((m) => m.metric === "weight")
          .slice(0, 20)
          .map((m) => ({ value: m.value, takenAt: m.takenAt.toISOString().slice(0, 10), quality: m.quality })),
      };
    }

    case "get_training_history": {
      const days = num(args.days, 42, 7, 365);
      const from = addDays(new Date(`${tehranDate()}T00:00:00.000Z`), -days);
      const workouts = await prisma.workout.findMany({
        where: { userId, date: { gte: from } },
        include: {
          exercises: { orderBy: { orderIndex: "asc" } },
          sessions: { include: { performances: true }, orderBy: { startedAt: "desc" }, take: 1 },
        },
        orderBy: { date: "desc" },
        take: 80,
      });
      return workouts.map((w) => ({
        id: w.id,
        date: w.date.toISOString().slice(0, 10),
        kind: w.kind,
        title: w.title,
        status: w.status,
        intensity: w.intensity,
        estimatedMinutes: w.estimatedMinutes,
        exerciseCount: w.exercises.length,
        lastSession: w.sessions[0]
          ? {
              durationMinutes: w.sessions[0].durationMinutes,
              rpe: w.sessions[0].rpe,
              sets: w.sessions[0].performances.length,
              volumeKg: Math.round(
                w.sessions[0].performances.reduce((s, p) => s + (p.weightKg ?? 0) * (p.reps ?? 0), 0),
              ),
            }
          : null,
      }));
    }

    case "get_weekly_plan": {
      const start = args.weekStart ? dayOr(args.weekStart, tehranDate()) : currentWeekStart();
      const end = addDays(start, 7);
      const [workouts, target, meals] = await Promise.all([
        prisma.workout.findMany({
          where: { userId, date: { gte: start, lt: end } },
          include: { exercises: { orderBy: { orderIndex: "asc" } } },
          orderBy: { date: "asc" },
        }),
        prisma.nutritionTarget.findFirst({
          where: { userId, effectiveFrom: { lte: start } },
          orderBy: { effectiveFrom: "desc" },
        }),
        prisma.meal.findMany({ where: { userId, date: { gte: start, lt: end } }, include: { items: true } }),
      ]);
      return {
        weekStart: start.toISOString().slice(0, 10),
        days: workouts.map((w) => ({
          id: w.id,
          date: w.date.toISOString().slice(0, 10),
          dayOfWeek: persianDayIndex(w.date),
          kind: w.kind,
          title: w.title,
          status: w.status,
          intensity: w.intensity,
          estimatedMinutes: w.estimatedMinutes,
          version: w.version,
          exercises: w.exercises.map((e) => ({
            id: e.id,
            name: e.name,
            muscleGroup: e.muscleGroup,
            sets: e.sets,
            reps: e.reps,
            restSeconds: e.restSeconds,
            notes: e.notes,
          })),
        })),
        nutritionTarget: target
          ? { kcal: target.kcal, proteinG: target.proteinG, carbsG: target.carbsG, fatG: target.fatG, waterMl: target.waterMl }
          : null,
        loggedMeals: meals.map((m) => ({
          date: m.date.toISOString().slice(0, 10),
          name: m.name,
          slot: m.slot,
          kcal: m.kcal,
          items: m.items.length,
        })),
      };
    }

    case "get_daily_nutrition": {
      const day = dayOr(args.date, tehranDate());
      const next = addDays(day, 1);
      const [meals, target, water] = await Promise.all([
        prisma.meal.findMany({ where: { userId, date: day }, include: { items: true }, orderBy: { createdAt: "asc" } }),
        prisma.nutritionTarget.findFirst({
          where: { userId, effectiveFrom: { lte: day } },
          orderBy: { effectiveFrom: "desc" },
        }),
        prisma.waterRecord.findMany({ where: { userId, timestamp: { gte: day, lt: next } } }),
      ]);
      const sum = meals.reduce(
        (acc, m) => ({
          kcal: acc.kcal + (m.kcal ?? 0),
          proteinG: acc.proteinG + (m.proteinG ?? 0),
          carbsG: acc.carbsG + (m.carbsG ?? 0),
          fatG: acc.fatG + (m.fatG ?? 0),
        }),
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      );
      return {
        date: day.toISOString().slice(0, 10),
        totals: {
          kcal: Math.round(sum.kcal),
          proteinG: Math.round(sum.proteinG),
          carbsG: Math.round(sum.carbsG),
          fatG: Math.round(sum.fatG),
        },
        waterMl: water.reduce((s, w) => s + w.amountMl, 0),
        target: target
          ? { kcal: target.kcal, proteinG: target.proteinG, carbsG: target.carbsG, fatG: target.fatG, waterMl: target.waterMl }
          : null,
        meals: meals.map((m) => ({
          id: m.id,
          slot: m.slot,
          name: m.name,
          source: m.source,
          confidence: m.confidence,
          kcal: m.kcal,
          proteinG: m.proteinG,
          carbsG: m.carbsG,
          fatG: m.fatG,
          items: m.items.map((i) => ({
            name: i.name,
            amount: i.amount,
            unit: i.unit,
            kcal: i.kcal,
            proteinG: i.proteinG,
            carbsG: i.carbsG,
            fatG: i.fatG,
            source: i.source,
          })),
        })),
      };
    }

    case "get_progress_data": {
      const days = num(args.days, 90, 7, 730);
      const from = addDays(new Date(`${tehranDate()}T00:00:00.000Z`), -days);
      const rows = await prisma.progressRecord.findMany({
        where: { userId, date: { gte: from } },
        orderBy: { date: "asc" },
        take: 400,
      });
      return rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        weightKg: r.weightKg,
        bodyFatPct: r.bodyFatPct,
        kcalConsumed: r.kcalConsumed,
        kcalTarget: r.kcalTarget,
        proteinConsumed: r.proteinConsumed,
        waterMl: r.waterMl,
        workoutsDone: r.workoutsDone,
        workoutsPlanned: r.workoutsPlanned,
        dataQuality: r.dataQuality,
      }));
    }

    default:
      throw new AppError(422, "tool_unknown", "این ابزار در برنامه تعریف نشده است.");
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
