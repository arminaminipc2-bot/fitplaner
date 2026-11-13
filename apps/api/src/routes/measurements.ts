import { Router } from "express";
import { z } from "zod";
import type { BodyMeasurement } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { zDataQuality, zDate, zMetric, zRecordSource, zUnit } from "../domain.js";
import { AppError, ok, parseBody, uid } from "../http.js";
import { ageFrom, bmi } from "../science/energy.js";
import { faNumber } from "../text.js";

export const measurementRouter = Router();

/**
 * The unit and the plausible range belong to the metric, not to the caller.
 * A "body fat of 340" is a data-entry mistake that would poison every chart,
 * so it is rejected here rather than stored.
 */
const METRIC_RULES: Record<string, { unit: z.infer<typeof zUnit>; min: number; max: number }> = {
  weight: { unit: "kg", min: 25, max: 300 },
  leanMass: { unit: "kg", min: 20, max: 200 },
  bodyFat: { unit: "percent", min: 3, max: 70 },
  waist: { unit: "cm", min: 40, max: 200 },
  hip: { unit: "cm", min: 50, max: 220 },
  neck: { unit: "cm", min: 20, max: 80 },
  restingHeartRate: { unit: "bpm", min: 30, max: 220 },
  soreness: { unit: "score", min: 0, max: 10 },
};

const writeSchema = z.object({
  metric: zMetric,
  value: z.number().finite(),
  takenAt: zDate,
  quality: zDataQuality.default("measured"),
  source: zRecordSource.default("manual"),
  note: z.string().trim().max(500).optional(),
});

function serialize(m: BodyMeasurement) {
  return {
    id: m.id,
    metric: m.metric,
    value: m.value,
    unit: m.unit,
    takenAt: m.takenAt.toISOString(),
    quality: m.quality,
    source: m.source,
    note: m.note,
  };
}

measurementRouter.get("/", async (req, res) => {
  const userId = uid(req);
  const metric = typeof req.query.metric === "string" ? req.query.metric : undefined;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;

  const items = await prisma.bodyMeasurement.findMany({
    where: { userId, ...(metric ? { metric } : {}), ...(from || to ? { takenAt: { gte: from, lte: to } } : {}) },
    orderBy: { takenAt: "asc" },
    take: clampLimit(req.query.limit),
  });
  ok(res, { items: items.map(serialize) });
});

/** Latest value per metric, plus a derived BMI — the Home screen reads this. */
measurementRouter.get("/latest", async (req, res) => {
  const userId = uid(req);
  const rows = await prisma.bodyMeasurement.findMany({
    where: { userId },
    orderBy: { takenAt: "desc" },
  });

  const latest = new Map<string, BodyMeasurement>();
  for (const row of rows) if (!latest.has(row.metric)) latest.set(row.metric, row);

  const items = [...latest.values()].map(serialize);
  const weight = latest.get("weight");
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (weight && profile?.heightCm) {
    const value = bmi(weight.value, profile.heightCm);
    if (value !== null) {
      items.push({
        id: "derived:bmi",
        metric: "bmi",
        value,
        unit: "score",
        takenAt: weight.takenAt.toISOString(),
        // Derived, and derived from a value that may itself be self-reported.
        quality: weight.quality === "measured" ? "estimated" : weight.quality,
        source: "manual",
        note: "محاسبه‌شده از آخرین وزن و قد",
      });
    }
  }

  ok(res, {
    items,
    heightCm: profile?.heightCm ?? null,
    ageYears: profile?.birthDate ? ageFrom(profile.birthDate) : null,
  });
});

measurementRouter.post("/", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(writeSchema, req.body);

  if (body.metric === "bmi") {
    throw AppError.validation({
      metric: "شاخص توده بدن محاسبه می‌شود و دستی ثبت نمی‌شود.",
    });
  }

  const rule = METRIC_RULES[body.metric];
  if (body.value < rule.min || body.value > rule.max) {
    throw AppError.validation({
      value: `مقدار این شاخص باید بین ${faNumber(rule.min)} و ${faNumber(rule.max)} باشد.`,
    });
  }

  const created = await prisma.bodyMeasurement.create({
    data: { userId, unit: rule.unit, ...body },
  });
  ok(res, serialize(created), 201);
});

measurementRouter.delete("/:id", async (req, res) => {
  const userId = uid(req);
  // Scoped delete: another user's id must not be deletable, even by accident.
  const deleted = await prisma.bodyMeasurement.deleteMany({
    where: { id: req.params.id, userId },
  });
  if (deleted.count === 0) throw AppError.notFound("اندازه‌گیری");
  ok(res, { deleted: true });
});

function clampLimit(raw: unknown): number {
  const n = Number(raw ?? 500);
  return Number.isFinite(n) ? Math.min(2000, Math.max(1, n)) : 500;
}
