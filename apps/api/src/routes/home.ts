import { Router } from "express";
import { prisma } from "../db.js";
import { ok, uid } from "../http.js";
import { addDays, tehranDate, tehranDayRange } from "../time.js";
import { buildDays, currentStreak, summarize } from "../services/rollup.js";

export const homeRouter = Router();

/**
 * One call for the Home screen. The page shows today's plan, today's intake and
 * the week's progress; fetching that as four requests would leave the screen
 * half-rendered while each one lands.
 */
homeRouter.get("/", async (req, res) => {
  const userId = uid(req);
  const today = new Date(`${tehranDate()}T00:00:00.000Z`);
  const weekStart = addDays(today, -persianDayIndex(today));
  const { start, end } = tehranDayRange(today);

  const [workouts, meals, water, target, measurements, profile, provider, weekRows] = await Promise.all([
    prisma.workout.findMany({
      where: { userId, date: today },
      include: { exercises: { orderBy: { orderIndex: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.meal.findMany({ where: { userId, date: today }, include: { items: true }, orderBy: { createdAt: "asc" } }),
    prisma.waterRecord.aggregate({ where: { userId, timestamp: { gte: start, lt: end } }, _sum: { amountMl: true } }),
    prisma.nutritionTarget.findFirst({ where: { userId, effectiveFrom: { lte: today } }, orderBy: { effectiveFrom: "desc" } }),
    prisma.bodyMeasurement.findMany({ where: { userId, metric: { in: ["weight", "bodyFat"] } }, orderBy: { takenAt: "desc" }, take: 2 }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.aiProviderConfig.findFirst({ where: { userId, enabled: true }, orderBy: { isDefault: "desc" } }),
    buildDays(userId, weekStart, today),
  ]);

  const consumed = meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + (m.kcal ?? 0),
      proteinG: acc.proteinG + (m.proteinG ?? 0),
      carbsG: acc.carbsG + (m.carbsG ?? 0),
      fatG: acc.fatG + (m.fatG ?? 0),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const next = await prisma.workout.findFirst({
    where: { userId, date: { gt: today } },
    orderBy: { date: "asc" },
  });

  ok(res, {
    date: today.toISOString(),
    displayName: profile?.displayName ?? null,
    workouts: workouts.map((w) => ({
      id: w.id,
      title: w.title,
      kind: w.kind,
      status: w.status,
      intensity: w.intensity,
      estimatedMinutes: w.estimatedMinutes,
      exerciseCount: w.exercises.length,
      version: w.version,
    })),
    nutrition: {
      consumed: {
        kcal: Math.round(consumed.kcal),
        proteinG: Math.round(consumed.proteinG),
        carbsG: Math.round(consumed.carbsG),
        fatG: Math.round(consumed.fatG),
      },
      target: target
        ? { kcal: target.kcal, proteinG: target.proteinG, carbsG: target.carbsG, fatG: target.fatG, waterMl: target.waterMl }
        : null,
      waterMl: water._sum.amountMl ?? 0,
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
        itemCount: m.items.length,
      })),
    },
    body: {
      weightKg: measurements.find((m) => m.metric === "weight")?.value ?? null,
      bodyFatPct: measurements.find((m) => m.metric === "bodyFat")?.value ?? null,
      takenAt: measurements[0]?.takenAt.toISOString() ?? null,
      quality: measurements[0]?.quality ?? null,
      heightCm: profile?.heightCm ?? null,
    },
    week: {
      from: weekStart.toISOString(),
      to: today.toISOString(),
      days: weekRows,
      streakDays: currentStreak(weekRows),
      summary: await summarize(userId, weekStart, today),
    },
    nextWorkout: next ? { id: next.id, title: next.title, date: next.date.toISOString(), kind: next.kind } : null,
    // Phase 5 turns this into a real answer call; the UI shows the honest state.
    ai: { configured: Boolean(provider), providerLabel: provider?.label ?? null },
  });
});

/** 0 = شنبه … 6 = جمعه, the week the app displays. */
function persianDayIndex(day: Date): number {
  return (day.getUTCDay() + 1) % 7;
}
