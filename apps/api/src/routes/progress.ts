import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { GOAL_TYPE, zDate, zGoalType, zMetric, zOptionalDate } from "../domain.js";
import { AppError, ok, parseBody, uid } from "../http.js";
import { addDays, tehranDate } from "../time.js";
import { buildDays, summarize } from "../services/rollup.js";

export const progressRouter = Router();

const rangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  until: zOptionalDate,
});

function windowOf(days: number, until?: Date) {
  const to = until ?? new Date(`${tehranDate()}T00:00:00.000Z`);
  return { from: addDays(to, -(days - 1)), to };
}

progressRouter.get("/", async (req, res) => {
  const userId = uid(req);
  const { days, until } = parseBody(rangeSchema, req.query);
  const { from, to } = windowOf(days, until);

  const [rows, summary] = await Promise.all([buildDays(userId, from, to), summarize(userId, from, to)]);
  ok(res, { from: from.toISOString(), to: to.toISOString(), days: rows, summary });
});

/** A single metric over time, for the charts on the Progress page. */
progressRouter.get("/series", async (req, res) => {
  const userId = uid(req);
  const { metric, days } = parseBody(
    z.object({ metric: zMetric, days: z.coerce.number().int().min(1).max(365).default(90) }),
    req.query,
  );
  const to = new Date(`${tehranDate()}T00:00:00.000Z`);

  const rows = await prisma.bodyMeasurement.findMany({
    where: { userId, metric, takenAt: { gte: addDays(to, -days), lte: new Date(to.getTime() + 86_400_000) } },
    orderBy: { takenAt: "asc" },
  });

  ok(res, {
    metric,
    points: rows.map((r) => ({
      at: r.takenAt.toISOString(),
      value: r.value,
      quality: r.quality,
      source: r.source,
    })),
  });
});

/** Freeze a day's rollup — used by the seed and by the monthly recap. */
progressRouter.post("/snapshot", async (req, res) => {
  const userId = uid(req);
  const { date } = parseBody(z.object({ date: zDate }), req.body);
  const [row] = await buildDays(userId, date, date);

  const target = await prisma.nutritionTarget.findFirst({
    where: { userId, effectiveFrom: { lte: date } },
    orderBy: { effectiveFrom: "desc" },
  });
  const planned = await prisma.workout.count({ where: { userId, date } });

  const saved = await prisma.progressRecord.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      weightKg: row.weightKg,
      bodyFatPct: row.bodyFatPct,
      kcalTarget: target?.kcal ?? null,
      kcalConsumed: row.kcalConsumed,
      proteinConsumed: row.proteinConsumed,
      waterMl: row.waterMl,
      workoutMinutes: row.workoutMinutes,
      workoutsDone: row.workoutsDone,
      workoutsPlanned: planned,
      dataQuality: row.dataQuality,
    },
    update: {
      weightKg: row.weightKg,
      bodyFatPct: row.bodyFatPct,
      kcalTarget: target?.kcal ?? null,
      kcalConsumed: row.kcalConsumed,
      proteinConsumed: row.proteinConsumed,
      waterMl: row.waterMl,
      workoutMinutes: row.workoutMinutes,
      workoutsDone: row.workoutsDone,
      workoutsPlanned: planned,
      dataQuality: row.dataQuality,
    },
  });

  ok(res, { id: saved.id, date: saved.date.toISOString() });
});

progressRouter.get("/snapshots", async (req, res) => {
  const userId = uid(req);
  const { from, to } = parseBody(
    z.object({ from: zOptionalDate, to: zOptionalDate }),
    req.query,
  );
  const rows = await prisma.progressRecord.findMany({
    where: { userId, ...(from || to ? { date: { gte: from, lte: to } } : {}) },
    orderBy: { date: "asc" },
  });
  ok(res, {
    items: rows.map((r) => ({
      date: r.date.toISOString(),
      weightKg: r.weightKg,
      bodyFatPct: r.bodyFatPct,
      kcalTarget: r.kcalTarget,
      kcalConsumed: r.kcalConsumed,
      proteinConsumed: r.proteinConsumed,
      waterMl: r.waterMl,
      workoutMinutes: r.workoutMinutes,
      workoutsDone: r.workoutsDone,
      workoutsPlanned: r.workoutsPlanned,
      dataQuality: r.dataQuality,
    })),
  });
});

// ---------- goals ----------

const goalSchema = z.object({
  type: zGoalType,
  targetValue: z.number().min(0).max(1000).optional(),
  unit: z.string().trim().max(20).optional(),
  startDate: zDate.optional(),
  targetDate: zDate.optional(),
  status: z.enum(["active", "achieved", "paused", "abandoned"]).default("active"),
  notes: z.string().trim().max(1000).optional(),
});

progressRouter.get("/goals", async (req, res) => {
  const items = await prisma.fitnessGoal.findMany({
    where: { userId: uid(req) },
    orderBy: { startDate: "desc" },
  });
  ok(res, {
    items: items.map((g) => ({
      id: g.id,
      type: g.type,
      targetValue: g.targetValue,
      unit: g.unit,
      startDate: g.startDate.toISOString(),
      targetDate: g.targetDate ? g.targetDate.toISOString() : null,
      status: g.status,
      notes: g.notes,
    })),
    types: GOAL_TYPE,
  });
});

progressRouter.post("/goals", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(goalSchema, req.body);
  const created = await prisma.fitnessGoal.create({
    data: {
      userId,
      type: body.type,
      targetValue: body.targetValue ?? null,
      unit: body.unit ?? null,
      targetDate: body.targetDate ?? null,
      status: body.status,
      notes: body.notes ?? null,
      ...(body.startDate ? { startDate: body.startDate } : {}),
    },
  });
  ok(res, { id: created.id, type: created.type }, 201);
});

progressRouter.patch("/goals/:id", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(goalSchema.partial(), req.body);
  const current = await prisma.fitnessGoal.findFirst({ where: { id: req.params.id, userId } });
  if (!current) throw AppError.notFound("هدف");

  const updated = await prisma.fitnessGoal.update({ where: { id: current.id }, data: body });
  ok(res, { id: updated.id, status: updated.status });
});

progressRouter.delete("/goals/:id", async (req, res) => {
  const userId = uid(req);
  const deleted = await prisma.fitnessGoal.deleteMany({ where: { id: req.params.id, userId } });
  if (deleted.count === 0) throw AppError.notFound("هدف");
  ok(res, { deleted: true });
});
