import { prisma } from "../db.js";
import { addDays, tehranDayRange } from "../time.js";

/**
 * Day-by-day rollups are computed from the source rows rather than read from a
 * cache, so a corrected meal or a completed workout shows up immediately.
 * Everything is scoped by userId in the query, not filtered afterwards.
 */
export type DayRollup = {
  date: string;
  workoutsPlanned: number;
  workoutsDone: number;
  workoutMinutes: number;
  kcalConsumed: number;
  proteinConsumed: number;
  waterMl: number;
  weightKg: number | null;
  bodyFatPct: number | null;
  /** measured | estimated | missing — how much of this day is real data. */
  dataQuality: string;
};

export async function buildDays(userId: string, fromDay: Date, toDay: Date): Promise<DayRollup[]> {
  const days: string[] = [];
  for (let d = new Date(fromDay); d <= toDay; d = addDays(d, 1)) days.push(d.toISOString().slice(0, 10));

  const start = tehranDayRange(fromDay).start;
  const end = tehranDayRange(toDay).end;

  const [workouts, meals, water, measurements] = await Promise.all([
    prisma.workout.findMany({
      where: { userId, date: { gte: fromDay, lte: toDay } },
      select: { date: true, status: true, estimatedMinutes: true, kind: true },
    }),
    prisma.meal.findMany({
      where: { userId, date: { gte: fromDay, lte: toDay } },
      select: { date: true, kcal: true, proteinG: true },
    }),
    prisma.waterRecord.findMany({
      where: { userId, timestamp: { gte: start, lt: end } },
      select: { timestamp: true, amountMl: true },
    }),
    prisma.bodyMeasurement.findMany({
      where: { userId, takenAt: { gte: start, lt: end }, metric: { in: ["weight", "bodyFat"] } },
      orderBy: { takenAt: "asc" },
    }),
  ]);

  const byDay = new Map<string, DayRollup>(
    days.map((date) => [
      date,
      {
        date,
        workoutsPlanned: 0,
        workoutsDone: 0,
        workoutMinutes: 0,
        kcalConsumed: 0,
        proteinConsumed: 0,
        waterMl: 0,
        weightKg: null,
        bodyFatPct: null,
        dataQuality: "missing",
      },
    ]),
  );

  for (const w of workouts) {
    const row = byDay.get(key(w.date));
    if (!row) continue;
    if (w.kind !== "rest") row.workoutsPlanned += 1;
    if (w.status === "completed") {
      row.workoutsDone += 1;
      row.workoutMinutes += w.estimatedMinutes ?? 0;
    }
  }

  for (const m of meals) {
    const row = byDay.get(key(m.date));
    if (!row) continue;
    row.kcalConsumed += m.kcal ?? 0;
    row.proteinConsumed += m.proteinG ?? 0;
  }

  for (const r of water) {
    const row = byDay.get(tehranKey(r.timestamp));
    if (row) row.waterMl += r.amountMl;
  }

  for (const m of measurements) {
    const row = byDay.get(tehranKey(m.takenAt));
    if (!row) continue;
    if (m.metric === "weight") row.weightKg = m.value;
    if (m.metric === "bodyFat") row.bodyFatPct = m.value;
    row.dataQuality = m.quality === "measured" ? "measured" : "estimated";
  }

  // A day with food logged is real data even without a weigh-in.
  for (const row of byDay.values()) {
    if (row.kcalConsumed > 0 && row.dataQuality === "missing") row.dataQuality = "measured";
    row.kcalConsumed = round1(row.kcalConsumed);
    row.proteinConsumed = round1(row.proteinConsumed);
  }

  return days.map((date) => byDay.get(date)!);
}

export type Summary = {
  days: number;
  workoutsPlanned: number;
  workoutsDone: number;
  adherencePct: number;
  streakDays: number;
  kcalAverage: number;
  proteinAverage: number;
  waterAverage: number;
  weightChangeKg: number | null;
  bodyFatChangePct: number | null;
  daysWithData: number;
  targetKcal: number | null;
};

export async function summarize(userId: string, fromDay: Date, toDay: Date): Promise<Summary> {
  const rows = await buildDays(userId, fromDay, toDay);
  const planned = rows.reduce((s, r) => s + r.workoutsPlanned, 0);
  const done = rows.reduce((s, r) => s + r.workoutsDone, 0);

  const weights = rows.filter((r) => r.weightKg !== null);
  const fats = rows.filter((r) => r.bodyFatPct !== null);
  const withData = rows.filter((r) => r.dataQuality !== "missing");
  const target = await prisma.nutritionTarget.findFirst({
    where: { userId, effectiveFrom: { lte: toDay } },
    orderBy: { effectiveFrom: "desc" },
  });

  return {
    days: rows.length,
    workoutsPlanned: planned,
    workoutsDone: done,
    adherencePct: planned === 0 ? 0 : Math.round((done / planned) * 100),
    streakDays: currentStreak(rows),
    kcalAverage: round1(avg(withData.map((r) => r.kcalConsumed))),
    proteinAverage: round1(avg(withData.map((r) => r.proteinConsumed))),
    waterAverage: Math.round(avg(withData.map((r) => r.waterMl))),
    weightChangeKg:
      weights.length >= 2 ? round1(weights[weights.length - 1].weightKg! - weights[0].weightKg!) : null,
    bodyFatChangePct:
      fats.length >= 2 ? round1(fats[fats.length - 1].bodyFatPct! - fats[0].bodyFatPct!) : null,
    daysWithData: withData.length,
    targetKcal: target?.kcal ?? null,
  };
}

/** Consecutive days ending today (or yesterday) with a completed workout. */
export function currentStreak(rows: DayRollup[]): number {
  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].workoutsDone > 0) streak += 1;
    else if (i === rows.length - 1) continue; // today is not over yet
    else break;
  }
  return streak;
}

function key(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function tehranKey(timestamp: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
