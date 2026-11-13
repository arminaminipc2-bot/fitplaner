import { z } from "zod";
import { prisma } from "../db.js";
import { AppError } from "../http.js";
import { zIntensity, zMealSlot, zWorkoutKind } from "../domain.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { AssistantKind } from "./ai/context.js";
import type { ToolCall } from "./ai/types.js";
import { executeReadTool, isWriteTool, writeToolOwner } from "./ai/tools.js";
import { ageFrom } from "../science/energy.js";
import { tehranDate } from "../time.js";
import { faNumber } from "../text.js";

/**
 * AI plan changes: a proposal is stored, shown, confirmed by the user, and only
 * then applied inside one transaction. Every operation keeps a full "before"
 * snapshot so the change can be reverted. Nothing here executes model text:
 * the operations are re-validated when they are applied, not when proposed.
 */

const zDateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ باید YYYY-MM-DD باشد.");

const zExerciseInput = z.object({
  name: z.string().trim().min(1).max(120),
  muscleGroup: z.string().trim().max(60).optional(),
  equipment: z.string().trim().max(60).optional(),
  sets: z.number().int().min(1).max(20),
  reps: z.string().trim().min(1).max(30),
  restSeconds: z.number().int().min(0).max(900).optional(),
  notes: z.string().trim().max(500).optional(),
});

const zWorkoutInput = z.object({
  date: zDateText,
  kind: zWorkoutKind,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  intensity: zIntensity.default("moderate"),
  estimatedMinutes: z.number().int().min(5).max(600).optional(),
  exercises: z.array(zExerciseInput).max(40).optional(),
});

const zMealItemInput = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().min(0.1).max(5000),
  unit: z.enum(["g", "ml", "piece", "tbsp", "tsp", "cup"]),
  kcal: z.number().min(0).max(9000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(1000),
});

const zMealInput = z.object({
  date: zDateText,
  slot: zMealSlot,
  name: z.string().trim().min(1).max(120),
  items: z.array(zMealItemInput).min(1).max(40),
});

const zTargetInput = z.object({
  effectiveFrom: zDateText,
  kcal: z.number().min(1000).max(6000),
  proteinG: z.number().min(0).max(400),
  carbsG: z.number().min(0).max(800),
  fatG: z.number().min(0).max(400),
  waterMl: z.number().int().min(500).max(8000).optional(),
});

const operationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workout.create"), workout: zWorkoutInput }),
  z.object({
    kind: z.literal("workout.update"),
    id: z.string().min(8).max(64),
    expectedVersion: z.number().int().min(1),
    patch: zWorkoutInput.partial(),
  }),
  z.object({
    kind: z.literal("workout.reschedule"),
    id: z.string().min(8).max(64),
    expectedVersion: z.number().int().min(1),
    date: zDateText,
  }),
  z.object({ kind: z.literal("workout.delete"), id: z.string().min(8).max(64) }),
  z.object({ kind: z.literal("targets.update"), target: zTargetInput, expectedVersion: z.number().int().min(0) }),
  z.object({ kind: z.literal("meal.create"), meal: zMealInput }),
  z.object({
    kind: z.literal("meal.update"),
    id: z.string().min(8).max(64),
    expectedVersion: z.number().int().min(1),
    patch: zMealInput.partial(),
  }),
  z.object({ kind: z.literal("meal.delete"), id: z.string().min(8).max(64) }),
]);

export type Operation = z.infer<typeof operationSchema>;

export function parseOperations(value: string): Operation[] {
  const raw = JSON.parse(value) as unknown;
  const result = z.array(operationSchema).min(1).max(12).safeParse(raw);
  if (!result.success) {
    throw new AppError(422, "plan_change_invalid", "عملیات پیشنهادی معتبر نیست.");
  }
  return result.data;
}

/** A user-facing Persian date, used in summaries the user reads before applying. */
function faDate(text: string): string {
  const date = new Date(`${text}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

const KIND_FA: Record<string, string> = {
  strength: "قدرتی",
  cardio: "هوازی",
  football: "فوتبال",
  speed: "سرعت",
  recovery: "ریکاوری",
  rest: "استراحت",
  match: "مسابقه",
};

const SLOT_FA: Record<string, string> = {
  breakfast: "صبحانه",
  lunch: "ناهار",
  dinner: "شام",
  snack: "میان‌وعده",
};

/**
 * Turns one model tool call into validated operations. Read tools are not
 * handled here — `executeReadTool` owns those and they never write.
 */
export async function operationsFromToolCall(
  userId: string,
  assistant: AssistantKind,
  call: ToolCall,
): Promise<{ operations: Operation[]; summary: string } | null> {
  const owner = writeToolOwner(call.name);
  if (owner === null) return null;
  if (owner !== assistant) {
    throw new AppError(
      422,
      "tool_wrong_assistant",
      assistant === "coach"
        ? "تغییر برنامهٔ غذایی فقط از گفت‌وگو با متخصص تغذیه انجام می‌شود."
        : "تغییر برنامهٔ تمرینی فقط از گفت‌وگو با مربی ورزشی انجام می‌شود.",
    );
  }

  let args: Record<string, unknown>;
  try {
    const parsed = JSON.parse(call.argumentsJson || "{}") as unknown;
    args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new AppError(422, "tool_arguments_invalid", "دستیار آرگومان معتبری برای ابزار نفرستاد.");
  }

  const modelSummary = typeof args.summary === "string" ? args.summary.trim().slice(0, 400) : "";

  switch (call.name) {
    case "create_workout": {
      const workout = zWorkoutInput.parse(args);
      return {
        operations: [{ kind: "workout.create", workout }],
        summary: modelSummary || `افزودن تمرین «${workout.title}» (${KIND_FA[workout.kind]}) در ${faDate(workout.date)}`,
      };
    }

    case "edit_workout": {
      const { summary: _s, workoutId, ...patch } = args;
      const id = z.string().min(8).max(64).parse(workoutId);
      const existing = await prisma.workout.findFirst({ where: { id, userId }, include: { exercises: true } });
      if (!existing) throw AppError.notFound("تمرین");
      if (existing.status === "completed") {
        throw new AppError(409, "workout_completed", "تمرین تکمیل‌شده را نمی‌توان با دستیار تغییر داد.");
      }
      const parsedPatch = zWorkoutInput.partial().parse(patch);
      return {
        operations: [
          { kind: "workout.update", id, expectedVersion: existing.version, patch: parsedPatch },
        ],
        summary:
          modelSummary ||
          `ویرایش تمرین «${existing.title}» در ${faDate(existing.date.toISOString().slice(0, 10))}`,
      };
    }

    case "reschedule_workout": {
      const id = z.string().min(8).max(64).parse(args.workoutId);
      const date = zDateText.parse(args.date);
      const existing = await prisma.workout.findFirst({ where: { id, userId } });
      if (!existing) throw AppError.notFound("تمرین");
      if (existing.status === "completed") {
        throw new AppError(409, "workout_completed", "تمرین تکمیل‌شده را نمی‌توان جابه‌جا کرد.");
      }
      return {
        operations: [{ kind: "workout.reschedule", id, expectedVersion: existing.version, date }],
        summary:
          modelSummary ||
          `جابه‌جایی «${existing.title}» از ${faDate(existing.date.toISOString().slice(0, 10))} به ${faDate(date)}`,
      };
    }

    case "delete_workout": {
      const id = z.string().min(8).max(64).parse(args.workoutId);
      const existing = await prisma.workout.findFirst({
        where: { id, userId },
        include: { _count: { select: { sessions: true } } },
      });
      if (!existing) throw AppError.notFound("تمرین");
      if (existing._count.sessions > 0) {
        throw new AppError(
          409,
          "workout_has_history",
          "این تمرین سابقهٔ اجرا دارد و حذفش تاریخچه را از بین می‌برد. می‌توانید شدتش را کم کنید.",
        );
      }
      return {
        operations: [{ kind: "workout.delete", id }],
        summary:
          modelSummary || `حذف تمرین «${existing.title}» از ${faDate(existing.date.toISOString().slice(0, 10))}`,
      };
    }

    case "update_weekly_plan": {
      const days = z
        .array(
          zWorkoutInput.extend({
            description: z.string().trim().max(2000).optional(),
          }),
        )
        .min(1)
        .max(7)
        .parse(args.days);

      const operations: Operation[] = [];
      for (const day of days) {
        const existing = await prisma.workout.findFirst({
          where: { userId, date: new Date(`${day.date}T00:00:00.000Z`) },
          include: { exercises: true },
        });
        if (existing && existing.status === "completed") {
          throw new AppError(
            409,
            "workout_completed",
            `روز ${faDate(day.date)} تمرین تکمیل‌شده دارد و بازنویسی نمی‌شود. روز دیگری را پیشنهاد بدهید.`,
          );
        }
        if (existing) {
          operations.push({
            kind: "workout.update",
            id: existing.id,
            expectedVersion: existing.version,
            patch: {
              date: day.date,
              kind: day.kind,
              title: day.title,
              intensity: day.intensity,
              ...(day.estimatedMinutes !== undefined ? { estimatedMinutes: day.estimatedMinutes } : {}),
              ...(day.exercises !== undefined ? { exercises: day.exercises } : {}),
              ...(day.description !== undefined ? { description: day.description } : {}),
            },
          });
        } else {
          operations.push({ kind: "workout.create", workout: day });
        }
      }
      return {
        operations,
        summary: modelSummary || `اصلاح برنامهٔ هفته: ${days.map((d) => `${faDate(d.date)} ${d.title}`).join("، ")}`,
      };
    }

    case "update_nutrition_targets": {
      const effectiveFrom =
        typeof args.effectiveFrom === "string" ? zDateText.parse(args.effectiveFrom) : tehranDate();
      const target = zTargetInput.parse({
        effectiveFrom,
        kcal: args.kcal,
        proteinG: args.proteinG,
        carbsG: args.carbsG,
        fatG: args.fatG,
        ...(args.waterMl !== undefined ? { waterMl: args.waterMl } : {}),
      });
      const existing = await prisma.nutritionTarget.findFirst({
        where: { userId, effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`) },
      });
      return {
        operations: [
          { kind: "targets.update", target, expectedVersion: existing?.version ?? 0 },
        ],
        summary:
          modelSummary ||
          `هدف غذایی از ${faDate(effectiveFrom)}: ${faNumber(target.kcal)} کیلوکالری، پروتئین ${faNumber(target.proteinG)} گرم`,
      };
    }

    case "add_meal": {
      const meal = zMealInput.parse(args);
      return {
        operations: [{ kind: "meal.create", meal }],
        summary:
          modelSummary ||
          `ثبت ${SLOT_FA[meal.slot]} «${meal.name}» در ${faDate(meal.date)}`,
      };
    }

    case "update_meal": {
      const { summary: _s, mealId, ...patch } = args;
      const id = z.string().min(8).max(64).parse(mealId);
      const existing = await prisma.meal.findFirst({ where: { id, userId } });
      if (!existing) throw AppError.notFound("وعده");
      const parsedPatch = zMealInput.partial().parse(patch);
      return {
        operations: [{ kind: "meal.update", id, expectedVersion: existing.version, patch: parsedPatch }],
        summary: modelSummary || `ویرایش وعدهٔ «${existing.name}»`,
      };
    }

    case "delete_meal": {
      const id = z.string().min(8).max(64).parse(mealId(args));
      const existing = await prisma.meal.findFirst({ where: { id, userId } });
      if (!existing) throw AppError.notFound("وعده");
      return {
        operations: [{ kind: "meal.delete", id }],
        summary: modelSummary || `حذف وعدهٔ «${existing.name}»`,
      };
    }

    default:
      return null;
  }
}

function mealId(args: Record<string, unknown>): unknown {
  return args.mealId;
}

// ---------- snapshots ----------

type WorkoutSnapshot = {
  id: string;
  date: string;
  kind: string;
  title: string;
  description: string | null;
  intensity: string;
  estimatedMinutes: number | null;
  programId: string | null;
  status: string;
  completedAt: string | null;
  notes: string | null;
  version: number;
  exercises: {
    id: string;
    name: string;
    muscleGroup: string | null;
    equipment: string | null;
    sets: number;
    reps: string;
    restSeconds: number | null;
    tempo: string | null;
    notes: string | null;
    orderIndex: number;
  }[];
};

type MealSnapshot = {
  id: string;
  date: string;
  slot: string;
  name: string;
  source: string;
  confidence: number | null;
  note: string | null;
  version: number;
  items: {
    id: string;
    name: string;
    brand: string | null;
    amount: number;
    unit: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    source: string;
    confidence: number | null;
  }[];
};

type TargetSnapshot = {
  id: string;
  effectiveFrom: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  notes: string | null;
  source: string;
  version: number;
};

async function snapshotWorkout(tx: Prisma.TransactionClient, userId: string, id: string): Promise<WorkoutSnapshot> {
  const row = await tx.workout.findFirst({ where: { id, userId }, include: { exercises: true } });
  if (!row) throw AppError.notFound("تمرین");
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    kind: row.kind,
    title: row.title,
    description: row.description,
    intensity: row.intensity,
    estimatedMinutes: row.estimatedMinutes,
    programId: row.programId,
    status: row.status,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    notes: row.notes,
    version: row.version,
    exercises: row.exercises.map((e) => ({
      id: e.id,
      name: e.name,
      muscleGroup: e.muscleGroup,
      equipment: e.equipment,
      sets: e.sets,
      reps: e.reps,
      restSeconds: e.restSeconds,
      tempo: e.tempo,
      notes: e.notes,
      orderIndex: e.orderIndex,
    })),
  };
}

async function snapshotMeal(tx: Prisma.TransactionClient, userId: string, id: string): Promise<MealSnapshot> {
  const row = await tx.meal.findFirst({ where: { id, userId }, include: { items: true } });
  if (!row) throw AppError.notFound("وعده");
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    slot: row.slot,
    name: row.name,
    source: row.source,
    confidence: row.confidence,
    note: row.note,
    version: row.version,
    items: row.items.map((i) => ({
      id: i.id,
      name: i.name,
      brand: i.brand,
      amount: i.amount,
      unit: i.unit,
      kcal: i.kcal,
      proteinG: i.proteinG,
      carbsG: i.carbsG,
      fatG: i.fatG,
      source: i.source,
      confidence: i.confidence,
    })),
  };
}

async function snapshotTarget(
  tx: Prisma.TransactionClient,
  userId: string,
  effectiveFrom: string,
): Promise<TargetSnapshot | null> {
  const row = await tx.nutritionTarget.findFirst({
    where: { userId, effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`) },
  });
  if (!row) return null;
  return {
    id: row.id,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    kcal: row.kcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    waterMl: row.waterMl,
    notes: row.notes,
    source: row.source,
    version: row.version,
  };
}

async function snapshotBefore(
  tx: Prisma.TransactionClient,
  userId: string,
  operation: Operation,
): Promise<unknown> {
  switch (operation.kind) {
    case "workout.create":
    case "meal.create":
      return null;
    case "workout.update":
    case "workout.reschedule":
    case "workout.delete":
      return snapshotWorkout(tx, userId, operation.id);
    case "meal.update":
    case "meal.delete":
      return snapshotMeal(tx, userId, operation.id);
    case "targets.update":
      return snapshotTarget(tx, userId, operation.target.effectiveFrom);
  }
}

// ---------- apply ----------

function totalsOf(items: { kcal: number; proteinG: number; carbsG: number; fatG: number }[]) {
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    kcal: round(items.reduce((s, i) => s + i.kcal, 0)),
    proteinG: round(items.reduce((s, i) => s + i.proteinG, 0)),
    carbsG: round(items.reduce((s, i) => s + i.carbsG, 0)),
    fatG: round(items.reduce((s, i) => s + i.fatG, 0)),
  };
}

/**
 * Health guardrail: an AI-proposed calorie target may not undercut a minor's
 * estimated basal rate, and never goes below the adult safety floor. This is
 * the same rule the science module applies to suggestions, enforced again here
 * because a model could propose anything.
 */
async function assertSafeTarget(tx: Prisma.TransactionClient, userId: string, kcal: number) {
  const [profile, weight] = await Promise.all([
    tx.profile.findUnique({ where: { userId } }),
    tx.bodyMeasurement.findFirst({
      where: { userId, metric: "weight" },
      orderBy: { takenAt: "desc" },
    }),
  ]);

  const age = profile?.birthDate ? ageFrom(profile.birthDate) : null;
  if (age !== null && age < 18) {
    let floor = 1500;
    if (weight && profile?.heightCm) {
      const offset = profile.sex === "male" ? 5 : profile.sex === "female" ? -161 : 0;
      const bmr = 10 * weight.value + 6.25 * profile.heightCm - 5 * age + offset;
      floor = Math.max(1200, Math.round(bmr));
    }
    if (kcal < floor) {
      throw new AppError(
        422,
        "nutrition_target_unsafe",
        `برای کاربر زیر ۱۸ سال هدف کالری نباید کمتر از ${faNumber(floor)} کیلوکالری باشد. کاهش وزن محدودکننده برای این سن توصیه نمی‌شود.`,
      );
    }
    return;
  }

  if (kcal < 1200) {
    throw new AppError(
      422,
      "nutrition_target_unsafe",
      "هدف کالری کمتر از ۱۲۰۰ کیلوکالری برای این برنامه پذیرفته نمی‌شود. یک هدف ایمن‌تر پیشنهاد بدهید.",
    );
  }
}

async function applyOperation(
  tx: Prisma.TransactionClient,
  userId: string,
  operation: Operation,
): Promise<unknown> {
  switch (operation.kind) {
    case "workout.create": {
      const w = operation.workout;
      const created = await tx.workout.create({
        data: {
          userId,
          date: new Date(`${w.date}T00:00:00.000Z`),
          kind: w.kind,
          title: w.title,
          description: w.description ?? null,
          intensity: w.intensity,
          estimatedMinutes: w.estimatedMinutes ?? null,
          exercises: {
            create: (w.exercises ?? []).map((e, i) => ({
              userId,
              name: e.name,
              muscleGroup: e.muscleGroup ?? null,
              equipment: e.equipment ?? null,
              sets: e.sets,
              reps: e.reps,
              restSeconds: e.restSeconds ?? 90,
              notes: e.notes ?? null,
              orderIndex: i,
            })),
          },
        },
        include: { exercises: true },
      });
      return { id: created.id };
    }

    case "workout.update":
    case "workout.reschedule": {
      const current = await tx.workout.findFirst({
        where: { id: operation.id, userId },
        include: { _count: { select: { sessions: true } } },
      });
      if (!current) throw AppError.notFound("تمرین");
      if (current.version !== operation.expectedVersion) {
        throw AppError.conflict(
          "version_conflict",
          "این تمرین از زمان پیشنهاد تغییر کرده است. پیشنهاد تازه‌ای بگیرید.",
        );
      }
      if (current.status === "completed") {
        throw AppError.conflict("workout_completed", "تمرین تکمیل‌شده تغییر نمی‌کند.");
      }

      const patch = operation.kind === "workout.update" ? operation.patch : {};
      if (patch.exercises && current._count.sessions > 0) {
        throw AppError.conflict(
          "workout_has_history",
          "این تمرین سابقهٔ اجرا دارد؛ فهرست حرکات حذف نمی‌شود تا تاریخچه حفظ شود.",
        );
      }

      await tx.workout.update({
        where: { id: current.id },
        data: {
          ...(operation.kind === "workout.reschedule"
            ? { date: new Date(`${operation.date}T00:00:00.000Z`) }
            : {}),
          ...(patch.date !== undefined ? { date: new Date(`${patch.date}T00:00:00.000Z`) } : {}),
          ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.intensity !== undefined ? { intensity: patch.intensity } : {}),
          ...(patch.estimatedMinutes !== undefined ? { estimatedMinutes: patch.estimatedMinutes } : {}),
          version: { increment: 1 },
        },
      });

      if (operation.kind === "workout.update" && patch.exercises) {
        await tx.exercise.deleteMany({ where: { workoutId: current.id } });
        await tx.exercise.createMany({
          data: patch.exercises.map((e, i) => ({
            workoutId: current.id,
            userId,
            name: e.name,
            muscleGroup: e.muscleGroup ?? null,
            equipment: e.equipment ?? null,
            sets: e.sets,
            reps: e.reps,
            restSeconds: e.restSeconds ?? 90,
            notes: e.notes ?? null,
            orderIndex: i,
          })),
        });
      }
      return { id: current.id };
    }

    case "workout.delete": {
      const current = await tx.workout.findFirst({
        where: { id: operation.id, userId },
        include: { _count: { select: { sessions: true } } },
      });
      if (!current) throw AppError.notFound("تمرین");
      if (current._count.sessions > 0) {
        throw new AppError(
          409,
          "workout_has_history",
          "این تمرین سابقهٔ اجرا دارد و حذف نمی‌شود.",
        );
      }
      await tx.workout.delete({ where: { id: current.id } });
      return null;
    }

    case "targets.update": {
      await assertSafeTarget(tx, userId, operation.target.kcal);
      const date = new Date(`${operation.target.effectiveFrom}T00:00:00.000Z`);
      const existing = await tx.nutritionTarget.findFirst({
        where: { userId, effectiveFrom: date },
      });
      if (existing && existing.version !== operation.expectedVersion) {
        throw AppError.conflict(
          "version_conflict",
          "هدف غذایی از زمان پیشنهاد تغییر کرده است. پیشنهاد تازه‌ای بگیرید.",
        );
      }
      const saved = await tx.nutritionTarget.upsert({
        where: { userId_effectiveFrom: { userId, effectiveFrom: date } },
        create: {
          userId,
          effectiveFrom: date,
          kcal: operation.target.kcal,
          proteinG: operation.target.proteinG,
          carbsG: operation.target.carbsG,
          fatG: operation.target.fatG,
          waterMl: operation.target.waterMl ?? 2500,
          source: "ai",
        },
        update: {
          kcal: operation.target.kcal,
          proteinG: operation.target.proteinG,
          carbsG: operation.target.carbsG,
          fatG: operation.target.fatG,
          ...(operation.target.waterMl !== undefined ? { waterMl: operation.target.waterMl } : {}),
          source: "ai",
          version: { increment: 1 },
        },
      });
      return { id: saved.id };
    }

    case "meal.create": {
      const meal = operation.meal;
      const created = await tx.meal.create({
        data: {
          userId,
          date: new Date(`${meal.date}T00:00:00.000Z`),
          slot: meal.slot,
          name: meal.name,
          source: "ai_text",
          ...totalsOf(meal.items),
          items: {
            create: meal.items.map((i) => ({
              userId,
              name: i.name,
              amount: i.amount,
              unit: i.unit,
              kcal: i.kcal,
              proteinG: i.proteinG,
              carbsG: i.carbsG,
              fatG: i.fatG,
              source: "ai_text",
            })),
          },
        },
      });
      return { id: created.id };
    }

    case "meal.update": {
      const current = await tx.meal.findFirst({ where: { id: operation.id, userId } });
      if (!current) throw AppError.notFound("وعده");
      if (current.version !== operation.expectedVersion) {
        throw AppError.conflict("version_conflict", "این وعده از زمان پیشنهاد تغییر کرده است.");
      }
      const patch = operation.patch;
      if (patch.items) {
        await tx.foodItem.deleteMany({ where: { mealId: current.id } });
        await tx.foodItem.createMany({
          data: patch.items.map((i) => ({
            mealId: current.id,
            userId,
            name: i.name,
            amount: i.amount,
            unit: i.unit,
            kcal: i.kcal,
            proteinG: i.proteinG,
            carbsG: i.carbsG,
            fatG: i.fatG,
            source: "ai_text",
          })),
        });
      }
      const items = await tx.foodItem.findMany({ where: { mealId: current.id } });
      await tx.meal.update({
        where: { id: current.id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.slot !== undefined ? { slot: patch.slot } : {}),
          ...(patch.date !== undefined ? { date: new Date(`${patch.date}T00:00:00.000Z`) } : {}),
          source: "ai_text",
          ...totalsOf(items),
          version: { increment: 1 },
        },
      });
      return { id: current.id };
    }

    case "meal.delete": {
      const current = await tx.meal.findFirst({ where: { id: operation.id, userId } });
      if (!current) throw AppError.notFound("وعده");
      await tx.meal.delete({ where: { id: current.id } });
      return null;
    }
  }
}

// ---------- public API ----------

export type ProposedChange = {
  id: string;
  summary: string;
  operations: Operation[];
  status: string;
  requiresConfirmation: boolean;
  createdAt: string;
};

function serializeChange(row: {
  id: string;
  summary: string;
  operations: string;
  status: string;
  requiresConfirmation: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    summary: row.summary,
    operations: parseOperations(row.operations),
    status: row.status,
    requiresConfirmation: row.requiresConfirmation,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Stores a proposal and its full before-snapshot. No row is written to the plan. */
export async function createPlanChange(
  userId: string,
  input: { conversationId: string | null; summary: string; operations: Operation[] },
): Promise<ProposedChange> {
  const parsed = z.array(operationSchema).min(1).max(12).parse(input.operations);

  const change = await prisma.$transaction(async (tx) => {
    const before: unknown[] = [];
    for (const operation of parsed) before.push(await snapshotBefore(tx, userId, operation));
    return tx.planChange.create({
      data: {
        userId,
        conversationId: input.conversationId,
        source: "ai",
        summary: input.summary.slice(0, 400),
        operations: JSON.stringify(parsed),
        beforeJson: JSON.stringify(before),
        status: "pending",
        requiresConfirmation: true,
      },
    });
  });

  return serializeChange(change);
}

/** Applies a pending proposal exactly once, inside one transaction. */
export async function applyPlanChange(userId: string, id: string) {
  const change = await prisma.planChange.findFirst({ where: { id, userId } });
  if (!change) throw AppError.notFound("تغییر برنامه");
  if (change.status === "applied") return serializeChange(change);
  if (change.status !== "pending") {
    throw AppError.conflict("plan_change_not_pending", "این تغییر دیگر در انتظار تأیید نیست.");
  }

  const operations = parseOperations(change.operations);

  const applied = await prisma.$transaction(async (tx) => {
    // Claim the row first: a double-click cannot apply the same change twice.
    const claimed = await tx.planChange.updateMany({
      where: { id, userId, status: "pending" },
      data: { status: "confirmed", confirmedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw AppError.conflict("plan_change_not_pending", "این تغییر هم‌زمان اعمال شده است.");
    }

    const after: unknown[] = [];
    for (const operation of operations) after.push(await applyOperation(tx, userId, operation));

    const done = await tx.planChange.update({
      where: { id },
      data: {
        status: "applied",
        appliedAt: new Date(),
        beforeJson: JSON.stringify({
          snapshots: JSON.parse(change.beforeJson ?? "[]") as unknown[],
          after,
        }),
      },
    });

    await tx.aiToolExecutionLog.updateMany({
      where: { userId, planChangeId: id },
      data: { status: "applied", appliedAt: new Date() },
    });

    return done;
  });

  return serializeChange(applied);
}

export async function rejectPlanChange(userId: string, id: string) {
  const change = await prisma.planChange.findFirst({ where: { id, userId } });
  if (!change) throw AppError.notFound("تغییر برنامه");
  if (change.status === "applied") {
    throw AppError.conflict("plan_change_applied", "این تغییر اعمال شده است؛ برای برگشت از «بازگردانی» استفاده کنید.");
  }
  const updated = await prisma.planChange.update({
    where: { id },
    data: { status: "rejected" },
  });
  await prisma.aiToolExecutionLog.updateMany({
    where: { userId, planChangeId: id },
    data: { status: "rejected" },
  });
  return serializeChange(updated);
}

/**
 * Reverting walks the stored snapshots backwards: created rows are removed,
 * updated rows are restored, deleted rows are re-created with their original
 * ids. A row that gained real history since the change is never silently
 * destroyed — the revert stops with a Persian explanation instead.
 */
export async function revertPlanChange(userId: string, id: string) {
  const change = await prisma.planChange.findFirst({ where: { id, userId } });
  if (!change) throw AppError.notFound("تغییر برنامه");
  if (change.status !== "applied") {
    throw AppError.conflict("plan_change_not_applied", "فقط تغییری که اعمال شده قابل بازگردانی است.");
  }

  const operations = parseOperations(change.operations);
  const stored = JSON.parse(change.beforeJson ?? "{}") as { snapshots?: unknown[]; after?: unknown[] };
  const snapshots = Array.isArray(stored.snapshots) ? stored.snapshots : JSON.parse(change.beforeJson ?? "[]") as unknown[];
  const after = Array.isArray(stored.after) ? stored.after : [];

  await prisma.$transaction(async (tx) => {
    for (let i = operations.length - 1; i >= 0; i -= 1) {
      await revertOperation(tx, userId, operations[i], snapshots[i], after[i]);
    }
    await tx.planChange.update({
      where: { id },
      data: { status: "reverted", revertedAt: new Date() },
    });
  });

  return serializeChange(await prisma.planChange.findUniqueOrThrow({ where: { id } }));
}

async function revertOperation(
  tx: Prisma.TransactionClient,
  userId: string,
  operation: Operation,
  before: unknown,
  after: unknown,
): Promise<void> {
  switch (operation.kind) {
    case "workout.create": {
      const created = after as { id?: string } | null;
      if (!created?.id) return;
      const row = await tx.workout.findFirst({
        where: { id: created.id, userId },
        include: { _count: { select: { sessions: true } } },
      });
      if (!row) return;
      if (row._count.sessions > 0) {
        throw new AppError(
          409,
          "revert_has_history",
          "این تمرین پس از اعمال، اجرا ثبت کرده است؛ برای حفظ تاریخچه بازگردانی متوقف شد.",
        );
      }
      await tx.workout.delete({ where: { id: row.id } });
      return;
    }

    case "workout.update":
    case "workout.reschedule": {
      const snapshot = before as WorkoutSnapshot;
      const current = await tx.workout.findFirst({
        where: { id: snapshot.id, userId },
        include: { _count: { select: { sessions: true } } },
      });
      if (!current) return;
      await tx.workout.update({
        where: { id: current.id },
        data: {
          date: new Date(`${snapshot.date}T00:00:00.000Z`),
          kind: snapshot.kind,
          title: snapshot.title,
          description: snapshot.description,
          intensity: snapshot.intensity,
          estimatedMinutes: snapshot.estimatedMinutes,
          status: snapshot.status,
          completedAt: snapshot.completedAt ? new Date(snapshot.completedAt) : null,
          notes: snapshot.notes,
          version: { increment: 1 },
        },
      });
      // Only restore the exercise list when nothing has been performed against
      // the current one; deleting performed exercises would erase history.
      if (current._count.sessions === 0) {
        await tx.exercise.deleteMany({ where: { workoutId: current.id } });
        await tx.exercise.createMany({
          data: snapshot.exercises.map((e) => ({
            id: e.id,
            workoutId: current.id,
            userId,
            name: e.name,
            muscleGroup: e.muscleGroup,
            equipment: e.equipment,
            sets: e.sets,
            reps: e.reps,
            restSeconds: e.restSeconds,
            tempo: e.tempo,
            notes: e.notes,
            orderIndex: e.orderIndex,
          })),
        });
      }
      return;
    }

    case "workout.delete": {
      const snapshot = before as WorkoutSnapshot;
      const exists = await tx.workout.findFirst({ where: { id: snapshot.id, userId } });
      if (exists) return;
      await tx.workout.create({
        data: {
          id: snapshot.id,
          userId,
          date: new Date(`${snapshot.date}T00:00:00.000Z`),
          kind: snapshot.kind,
          title: snapshot.title,
          description: snapshot.description,
          intensity: snapshot.intensity,
          estimatedMinutes: snapshot.estimatedMinutes,
          programId: snapshot.programId,
          status: snapshot.status,
          completedAt: snapshot.completedAt ? new Date(snapshot.completedAt) : null,
          notes: snapshot.notes,
          exercises: {
            create: snapshot.exercises.map((e) => ({
              id: e.id,
              userId,
              name: e.name,
              muscleGroup: e.muscleGroup,
              equipment: e.equipment,
              sets: e.sets,
              reps: e.reps,
              restSeconds: e.restSeconds,
              tempo: e.tempo,
              notes: e.notes,
              orderIndex: e.orderIndex,
            })),
          },
        },
      });
      return;
    }

    case "targets.update": {
      const snapshot = before as TargetSnapshot | null;
      const created = after as { id?: string } | null;
      if (!snapshot) {
        if (created?.id) await tx.nutritionTarget.deleteMany({ where: { id: created.id, userId } });
        return;
      }
      if (created?.id && created.id !== snapshot.id) {
        await tx.nutritionTarget.deleteMany({ where: { id: created.id, userId } });
        const clash = await tx.nutritionTarget.findFirst({
          where: { userId, effectiveFrom: new Date(`${snapshot.effectiveFrom}T00:00:00.000Z`) },
        });
        if (clash) {
          await tx.nutritionTarget.update({
            where: { id: clash.id },
            data: { ...snapshotFields(snapshot), version: { increment: 1 } },
          });
          return;
        }
        await tx.nutritionTarget.create({
          data: {
            id: snapshot.id,
            userId,
            effectiveFrom: new Date(`${snapshot.effectiveFrom}T00:00:00.000Z`),
            ...snapshotFields(snapshot),
          },
        });
        return;
      }
      if (created?.id) {
        await tx.nutritionTarget.update({
          where: { id: created.id },
          data: { ...snapshotFields(snapshot), version: { increment: 1 } },
        });
      }
      return;
    }

    case "meal.create": {
      const created = after as { id?: string } | null;
      if (created?.id) await tx.meal.deleteMany({ where: { id: created.id, userId } });
      return;
    }

    case "meal.update": {
      const snapshot = before as MealSnapshot;
      const current = await tx.meal.findFirst({ where: { id: snapshot.id, userId } });
      if (!current) return;
      await tx.foodItem.deleteMany({ where: { mealId: current.id } });
      await tx.foodItem.createMany({
        data: snapshot.items.map((i) => ({
          id: i.id,
          mealId: current.id,
          userId,
          name: i.name,
          brand: i.brand,
          amount: i.amount,
          unit: i.unit,
          kcal: i.kcal,
          proteinG: i.proteinG,
          carbsG: i.carbsG,
          fatG: i.fatG,
          source: i.source,
          confidence: i.confidence,
        })),
      });
      const items = await tx.foodItem.findMany({ where: { mealId: current.id } });
      await tx.meal.update({
        where: { id: current.id },
        data: {
          date: new Date(`${snapshot.date}T00:00:00.000Z`),
          slot: snapshot.slot,
          name: snapshot.name,
          source: snapshot.source,
          confidence: snapshot.confidence,
          note: snapshot.note,
          ...totalsOf(items),
          version: { increment: 1 },
        },
      });
      return;
    }

    case "meal.delete": {
      const snapshot = before as MealSnapshot;
      const exists = await tx.meal.findFirst({ where: { id: snapshot.id, userId } });
      if (exists) return;
      await tx.meal.create({
        data: {
          id: snapshot.id,
          userId,
          date: new Date(`${snapshot.date}T00:00:00.000Z`),
          slot: snapshot.slot,
          name: snapshot.name,
          source: snapshot.source,
          confidence: snapshot.confidence,
          note: snapshot.note,
          ...totalsOf(snapshot.items),
          items: {
            create: snapshot.items.map((i) => ({
              id: i.id,
              userId,
              name: i.name,
              brand: i.brand,
              amount: i.amount,
              unit: i.unit,
              kcal: i.kcal,
              proteinG: i.proteinG,
              carbsG: i.carbsG,
              fatG: i.fatG,
              source: i.source,
              confidence: i.confidence,
            })),
          },
        },
      });
      return;
    }
  }
}

function snapshotFields(snapshot: TargetSnapshot) {
  return {
    kcal: snapshot.kcal,
    proteinG: snapshot.proteinG,
    carbsG: snapshot.carbsG,
    fatG: snapshot.fatG,
    waterMl: snapshot.waterMl,
    notes: snapshot.notes,
    source: snapshot.source,
  };
}

/** Read tools are executed outside a transaction; this is the small seam chat uses. */
export async function runToolCall(userId: string, call: ToolCall): Promise<unknown> {
  return executeReadTool(userId, call);
}

export { isWriteTool };
