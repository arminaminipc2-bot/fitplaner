import { Router } from "express";
import { z } from "zod";
import type { FoodItem, Meal } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { RECORD_SOURCE, zDate, zIsoDateTime, zMealSlot, zRecordSource } from "../domain.js";
import type { ActivityLevel, GoalType, Sex } from "../domain.js";
import { AppError, ok, parseBody, uid } from "../http.js";
import { tehranDate, tehranDayRange } from "../time.js";
import { ageFrom, computeEnergyTargets } from "../science/energy.js";
import { analyzeFood } from "../services/food-analysis.js";

export const nutritionRouter = Router();

const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(80).optional(),
  amount: z.number().min(0.1).max(5000),
  unit: z.enum(["g", "ml", "piece", "tbsp", "tsp", "cup"]),
  kcal: z.number().min(0).max(9000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(1000),
  source: zRecordSource.default("manual"),
  confidence: z.number().min(0).max(1).optional(),
});

const mealSchema = z.object({
  date: zDate,
  slot: zMealSlot,
  name: z.string().trim().min(1).max(120),
  source: z.enum(RECORD_SOURCE).default("manual"),
  confidence: z.number().min(0).max(1).optional(),
  note: z.string().trim().max(500).optional(),
  items: z.array(itemSchema).max(40).optional(),
});

function totals(items: { kcal: number; proteinG: number; carbsG: number; fatG: number }[]) {
  return {
    kcal: round(items.reduce((s, i) => s + i.kcal, 0)),
    proteinG: round(items.reduce((s, i) => s + i.proteinG, 0)),
    carbsG: round(items.reduce((s, i) => s + i.carbsG, 0)),
    fatG: round(items.reduce((s, i) => s + i.fatG, 0)),
  };
}

function serializeMeal(m: Meal & { items?: FoodItem[] }) {
  const items = m.items ?? [];
  return {
    id: m.id,
    date: m.date.toISOString(),
    slot: m.slot,
    name: m.name,
    source: m.source,
    confidence: m.confidence,
    note: m.note,
    planId: m.planId,
    version: m.version,
    totals: totals(items),
    items: items.map((i) => ({
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

async function ownedMeal(userId: string, id: string) {
  const found = await prisma.meal.findFirst({ where: { id, userId }, include: { items: true } });
  if (!found) throw AppError.notFound("وعده");
  return found;
}

// ---------- targets ----------

nutritionRouter.get("/targets", async (req, res) => {
  const userId = uid(req);
  const target = await prisma.nutritionTarget.findFirst({
    where: { userId },
    orderBy: { effectiveFrom: "desc" },
  });
  ok(res, target ? serializeTarget(target) : null);
});

const targetSchema = z.object({
  effectiveFrom: zDate,
  kcal: z.number().min(800).max(6000),
  proteinG: z.number().min(0).max(400),
  carbsG: z.number().min(0).max(800),
  fatG: z.number().min(0).max(400),
  waterMl: z.number().int().min(500).max(8000).default(2500),
  notes: z.string().trim().max(500).optional(),
});

nutritionRouter.put("/targets", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(targetSchema, req.body);
  const saved = await prisma.nutritionTarget.upsert({
    where: { userId_effectiveFrom: { userId, effectiveFrom: body.effectiveFrom } },
    create: { userId, ...body },
    update: {
      kcal: body.kcal,
      proteinG: body.proteinG,
      carbsG: body.carbsG,
      fatG: body.fatG,
      waterMl: body.waterMl,
      notes: body.notes ?? null,
      version: { increment: 1 },
    },
  });
  ok(res, serializeTarget(saved));
});

/**
 * Suggest targets from the profile and the latest weight. The numbers come from
 * the documented formulas, and the warnings travel with them so the UI can say
 * when a guardrail changed the result.
 */
nutritionRouter.post("/targets/suggest", async (req, res) => {
  const userId = uid(req);
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const weight = await prisma.bodyMeasurement.findFirst({
    where: { userId, metric: "weight" },
    orderBy: { takenAt: "desc" },
  });

  const missing: string[] = [];
  if (!profile?.sex) missing.push("sex");
  if (!profile?.birthDate) missing.push("birthDate");
  if (!profile?.heightCm) missing.push("heightCm");
  if (!profile?.activityLevel) missing.push("activityLevel");
  if (!profile?.goal) missing.push("goal");
  if (!weight) missing.push("weight");
  if (missing.length > 0) {
    throw new AppError(
      422,
      "profile_incomplete",
      "برای محاسبه هدف انرژی، اطلاعات لازم در پروفایل کامل نیست.",
      { missing: missing.join(",") },
    );
  }

  const suggestion = computeEnergyTargets({
    sex: profile!.sex as Sex,
    ageYears: ageFrom(profile!.birthDate!) ?? 0,
    heightCm: profile!.heightCm!,
    weightKg: weight!.value,
    activityLevel: profile!.activityLevel as ActivityLevel,
    goal: profile!.goal as GoalType,
  });

  ok(res, { ...suggestion, measuredAt: weight!.takenAt.toISOString(), quality: weight!.quality });
});

/**
 * Photo / text / transcript → an estimate the user must confirm. Nothing is
 * stored here: the client shows the editable card and saves through POST /meals.
 */
nutritionRouter.post("/analyze", async (req, res) => {
  const body = parseBody(
    z
      .object({
        text: z.string().trim().max(2000).optional(),
        image: z.string().max(900_000).optional(),
        source: z.enum(["ai_text", "ai_voice", "ai_photo"]).optional(),
        providerConfigId: z.string().min(8).max(64).optional(),
        modelId: z.string().min(1).max(120).optional(),
      })
      .refine((value) => Boolean(value.text?.trim() || value.image), {
        message: "توضیح یا تصویر غذا لازم است.",
        path: ["text"],
      }),
    req.body,
  );

  const estimate = await analyzeFood(uid(req), body);
  ok(res, estimate);
});

// ---------- meals ----------

nutritionRouter.get("/meals", async (req, res) => {
  const userId = uid(req);
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;

  const meals = await prisma.meal.findMany({
    where: { userId, ...(from || to ? { date: { gte: from, lte: to } } : {}) },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
  ok(res, { items: meals.map(serializeMeal) });
});

nutritionRouter.post("/meals", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(mealSchema, req.body);

  const created = await prisma.meal.create({
    data: {
      userId,
      date: body.date,
      slot: body.slot,
      name: body.name,
      source: body.source,
      confidence: body.confidence ?? null,
      note: body.note ?? null,
      ...totals(body.items ?? []),
      items: {
        create: (body.items ?? []).map((i) => ({
          userId,
          name: i.name,
          brand: i.brand ?? null,
          amount: i.amount,
          unit: i.unit,
          kcal: i.kcal,
          proteinG: i.proteinG,
          carbsG: i.carbsG,
          fatG: i.fatG,
          source: i.source,
          confidence: i.confidence ?? null,
        })),
      },
    },
    include: { items: true },
  });

  ok(res, serializeMeal(created), 201);
});

/**
 * Replacing the items recomputes the totals. An AI estimate the user corrected
 * becomes a user record — the stored numbers then no longer carry a confidence.
 */
nutritionRouter.patch("/meals/:id", async (req, res) => {
  const userId = uid(req);
  const current = await ownedMeal(userId, req.params.id);
  const body = parseBody(
    z.object({
      name: mealSchema.shape.name.optional(),
      slot: zMealSlot.optional(),
      date: zDate.optional(),
      note: z.string().trim().max(500).optional(),
      items: z.array(itemSchema).max(40).optional(),
      version: z.number().int().min(1),
    }),
    req.body,
  );

  if (body.version !== current.version) {
    throw AppError.conflict("version_conflict", "این وعده هم‌زمان تغییر کرده است.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (body.items) {
      await tx.foodItem.deleteMany({ where: { mealId: current.id } });
      await tx.foodItem.createMany({
        data: body.items.map((i) => ({
          mealId: current.id,
          userId,
          name: i.name,
          brand: i.brand ?? null,
          amount: i.amount,
          unit: i.unit,
          kcal: i.kcal,
          proteinG: i.proteinG,
          carbsG: i.carbsG,
          fatG: i.fatG,
          source: i.source,
          confidence: i.confidence ?? null,
        })),
      });
    }

    const items = await tx.foodItem.findMany({ where: { mealId: current.id } });
    return tx.meal.update({
      where: { id: current.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.slot !== undefined ? { slot: body.slot } : {}),
        ...(body.date !== undefined ? { date: body.date } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...totals(items),
        version: { increment: 1 },
      },
      include: { items: true },
    });
  });

  ok(res, serializeMeal(updated));
});

nutritionRouter.delete("/meals/:id", async (req, res) => {
  const userId = uid(req);
  const deleted = await prisma.meal.deleteMany({ where: { id: req.params.id, userId } });
  if (deleted.count === 0) throw AppError.notFound("وعده");
  ok(res, { deleted: true });
});

// ---------- water ----------

nutritionRouter.get("/water", async (req, res) => {
  const userId = uid(req);
  const day = parseBody(z.object({ date: zDate }), { date: req.query.date ?? tehranDate() }).date;
  const { start, end } = tehranDayRange(day);
  const rows = await prisma.waterRecord.findMany({
    where: { userId, timestamp: { gte: start, lt: end } },
  });
  ok(res, { date: day.toISOString(), amountMl: rows.reduce((s, r) => s + r.amountMl, 0) });
});

nutritionRouter.post("/water", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(
    z.object({ amountMl: z.number().int().min(1).max(3000), timestamp: zIsoDateTime.optional() }),
    req.body,
  );
  const created = await prisma.waterRecord.create({
    data: { userId, amountMl: body.amountMl, timestamp: body.timestamp ?? new Date() },
  });
  ok(res, { id: created.id, amountMl: created.amountMl }, 201);
});

function serializeTarget(t: {
  id: string;
  effectiveFrom: Date;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  notes: string | null;
  source: string;
  version: number;
}) {
  return {
    id: t.id,
    effectiveFrom: t.effectiveFrom.toISOString(),
    kcal: t.kcal,
    proteinG: t.proteinG,
    carbsG: t.carbsG,
    fatG: t.fatG,
    waterMl: t.waterMl,
    notes: t.notes,
    source: t.source,
    version: t.version,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
