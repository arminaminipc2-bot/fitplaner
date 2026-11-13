import type {
  ChatMessageDto,
  ExerciseDto,
  HomeDay,
  MealDto,
  NotificationDto,
  PlanChangeDto,
  RollupSummary,
  WorkoutDto,
} from "./api";
import { toUiQuality } from "./api";
import type {
  ChatRole,
  DataQuality,
  DayStatus,
  Exercise,
  MacroIntake,
  MacroTargets,
  MealDisplay,
  PlanChange,
  Workout,
  WorkoutKind,
} from "./domain";
import { WORKOUT_KIND_FA } from "./domain";
import { faNum } from "./format";

/**
 * API payload → what the components display. The server's names are already
 * close, so this layer mostly fills in what a card needs and refuses to invent
 * anything the response did not carry.
 */

const distinct = (values: Array<string | null | undefined>): string[] => {
  const out: string[] = [];
  for (const v of values) if (v && !out.includes(v)) out.push(v);
  return out;
};

export function toDisplayExercise(e: ExerciseDto): Exercise {
  return {
    id: e.id,
    name: e.name,
    sets: e.sets,
    reps: e.reps,
    restSeconds: e.restSeconds ?? undefined,
    muscleGroup: e.muscleGroup ?? undefined,
    equipment: e.equipment ?? undefined,
    notes: e.notes ?? undefined,
  };
}

/** Today's workouts arrive from `/home` without nested exercises, so the card gets what exists. */
export type WorkoutSource =
  | WorkoutDto
  | {
      id: string;
      title: string;
      kind: WorkoutKind;
      status: WorkoutDto["status"];
      intensity: WorkoutDto["intensity"];
      estimatedMinutes: number | null;
      exerciseCount: number;
      version: number;
      date?: string;
    };

export function toDisplayWorkout(w: WorkoutSource): Workout {
  const withExercises = "exercises" in w && w.exercises ? w.exercises.map(toDisplayExercise) : [];
  const exerciseCount = "exerciseCount" in w ? w.exerciseCount : withExercises.length;
  return {
    id: w.id,
    name: w.title,
    kind: w.kind,
    muscleGroups: distinct(withExercises.map((e) => e.muscleGroup)),
    scheduledDate: "date" in w && w.date ? w.date : undefined,
    intensity: w.intensity,
    estimatedMinutes: w.estimatedMinutes ?? undefined,
    status: w.status,
    done: w.status === "completed",
    exerciseCount,
    version: w.version,
    exercises: "exercises" in w ? withExercises : undefined,
  };
}

export function toMacroIntake(
  t: { kcal: number; proteinG: number; carbsG: number; fatG: number },
  waterMl: number,
): MacroIntake {
  return { kcal: t.kcal, protein: t.proteinG, carbs: t.carbsG, fat: t.fatG, waterMl };
}

export function toMacroTargets(
  t: { kcal: number; proteinG: number; carbsG: number; fatG: number; waterMl: number } | null,
): MacroTargets | null {
  return t
    ? { kcal: t.kcal, protein: t.proteinG, carbs: t.carbsG, fat: t.fatG, waterMl: t.waterMl }
    : null;
}

type MealLike = {
  id: string;
  slot: MealDto["slot"];
  name: string;
  source: MealDto["source"];
  confidence: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** Home sends per-meal totals inline; the meals endpoint sends items that sum to them. */
export function toDisplayMeal(m: MealLike & { itemCount?: number; items?: MealDto["items"] }): MealDisplay {
  return {
    id: m.id,
    slot: m.slot,
    name: m.name,
    source: m.source,
    confidence: m.confidence ?? undefined,
    kcal: m.kcal,
    protein: m.proteinG,
    carbs: m.carbsG,
    fat: m.fatG,
    itemCount: m.itemCount ?? m.items?.length ?? 0,
  };
}

/* ---------- week grid ---------- */

/**
 * A day cell can only say what the rollup proves. `rest` therefore means
 * "nothing was planned", not "the plan told you to recover".
 */
export function toDayStatus(day: HomeDay, today: string): DayStatus {
  if (day.date === today) return "today";
  if (day.workoutsDone > 0) return "completed";
  if (day.date < today) return day.workoutsPlanned > 0 ? "missed" : "rest";
  return day.workoutsPlanned > 0 ? "planned" : "rest";
}

export function dayStatusMap(days: HomeDay[], today: string): Record<string, DayStatus> {
  const out: Record<string, DayStatus> = {};
  for (const d of days) out[d.date] = toDayStatus(d, today);
  return out;
}

/* ---------- chat ---------- */

/**
 * The API stores `assistant` and puts the assistant kind on the conversation, so
 * a bubble's Persian author needs both.
 */
export function toChatRole(role: ChatMessageDto["role"], assistant: "coach" | "nutritionist"): ChatRole {
  return role === "user" ? "user" : assistant;
}

export function toQuality(quality: string | null | undefined): DataQuality | undefined {
  if (quality === "measured" || quality === "estimated" || quality === "self_reported") {
    return toUiQuality(quality);
  }
  return undefined;
}

/* ---------- plan changes ---------- */

const OP_FA: Record<string, string> = {
  "workout.update": "ویرایش تمرین",
  "workout.create": "افزودن تمرین",
  "workout.delete": "حذف تمرین",
  "workout.status": "تغییر وضعیت تمرین",
  "meal.update": "ویرایش وعده",
  "meal.delete": "حذف وعده",
  "target.update": "تغییر هدف روزانه",
  "measurement.create": "افزودن اندازه‌گیری",
};

const opName = (raw: unknown): string => ((raw ?? {}) as { op?: string }).op ?? "";

function fieldLine(op: string, key: string, value: unknown): string {
  if (key === "kind" && typeof value === "string" && value in WORKOUT_KIND_FA) {
    return `${op} → ${WORKOUT_KIND_FA[value as WorkoutKind]}`;
  }
  if (typeof value === "number") return `${op} → ${faNum(value)}`;
  if (typeof value === "string") return `${op} → ${value}`;
  return `${op} → ${JSON.stringify(value)}`;
}

export function toPlanChange(c: PlanChangeDto): PlanChange {
  const detail: string[] = [];
  for (const raw of c.operations) {
    const op = (raw ?? {}) as { op?: string; target?: string; set?: Record<string, unknown> };
    if (!op.op) continue;
    const label = `${OP_FA[op.op] ?? op.op}${op.target ? ` (${op.target})` : ""}`;
    const entries = Object.entries(op.set ?? {});
    if (entries.length === 0) detail.push(label);
    else for (const [key, value] of entries) detail.push(fieldLine(label, key, value));
  }
  return {
    id: c.id,
    summary: c.summary,
    detail,
    // removing data is irreversible; the server's own flag covers anything else
    // it decided needs a human in the loop
    destructive: c.operations.some((raw) => opName(raw).endsWith(".delete")) || c.requiresConfirmation,
  };
}

export const isUnread = (n: NotificationDto): boolean => n.readAt === null;

/* ---------- summary wording ---------- */

/**
 * «۳ از ۵ جلسه» plus the adherence percentage come from the same rollup; one
 * sentence here keeps Home and Progress from phrasing it two different ways.
 */
export function adherenceSentence(summary: RollupSummary): string {
  if (summary.workoutsPlanned === 0) return "این بازه تمرین برنامه‌ریزی‌شده‌ای ندارد.";
  return `${faNum(summary.workoutsDone)} از ${faNum(summary.workoutsPlanned)} جلسه انجام شده (${faNum(summary.adherencePct)}٪).`;
}
