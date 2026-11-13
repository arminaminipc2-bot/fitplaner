/**
 * Domain shapes the UI speaks in. These are deliberately the same names the API
 * will return in Phase 4, so pages stop needing a translation layer once real
 * data replaces the gallery fixtures.
 */

export type WorkoutKind =
  | "strength"
  | "cardio"
  | "football"
  | "speed"
  | "recovery"
  | "rest"
  | "match";

/** Persian labels live here, not inside components, so a day cell and a chip never drift apart. */
export const WORKOUT_KIND_FA: Record<WorkoutKind, string> = {
  strength: "تمرین قدرتی",
  cardio: "تمرین هوازی",
  football: "تمرین فوتبال",
  speed: "تمرین سرعت",
  recovery: "تمرین ریکاوری",
  rest: "استراحت",
  match: "مسابقه",
};

/** Monochrome glyph per kind lives in the UI layer (`KindIcon`), not here. */


export type DayStatus = "completed" | "planned" | "missed" | "rest" | "today" | "future";

export const DAY_STATUS_FA: Record<DayStatus, string> = {
  completed: "انجام‌شده",
  planned: "برنامه‌ریزی‌شده",
  missed: "از‌دست‌رفته",
  rest: "استراحت",
  today: "امروز",
  future: "آتی",
};

/** The wire spelling is `moderate`; the label stays «متوسط». */
export type Intensity = "low" | "moderate" | "high" | "max";

export const INTENSITY_FA: Record<Intensity, string> = {
  low: "سبک",
  moderate: "متوسط",
  high: "سنگین",
  max: "بسیار سنگین",
};

export type Sex = "male" | "female" | "other" | "undisclosed";

export const SEX_FA: Record<Sex, string> = {
  male: "مرد",
  female: "زن",
  other: "دیگر",
  undisclosed: "ترجیح نمی‌دهم بگویم",
};

/* ---------- vocabularies that arrive from the API ---------- */

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "athlete";

export const ACTIVITY_LEVEL_FA: Record<ActivityLevel, string> = {
  sedentary: "کم‌تحرک",
  light: "نیمه‌فعال",
  moderate: "فعال",
  active: "خیلی فعال",
  athlete: "ورزشکار",
};

export type TrainingExperience = "beginner" | "intermediate" | "advanced" | "returning";

export const TRAINING_EXPERIENCE_FA: Record<TrainingExperience, string> = {
  beginner: "تازه‌کار",
  intermediate: "متوسط",
  advanced: "پیشرفته",
  returning: "بازگشت بعد از وقفه",
};

export type GoalType = "lose_fat" | "gain_muscle" | "performance" | "health" | "competition";

export const GOAL_TYPE_FA: Record<GoalType, string> = {
  lose_fat: "کاهش چربی",
  gain_muscle: "افزایش توده عضلانی",
  performance: "بهبود عملکرد",
  health: "سلامت عمومی",
  competition: "آمادگی مسابقه",
};

export type WorkoutStatus = "scheduled" | "completed" | "missed" | "skipped" | "rest";

export const WORKOUT_STATUS_FA: Record<WorkoutStatus, string> = {
  scheduled: "برنامه‌ریزی‌شده",
  completed: "انجام‌شده",
  missed: "از‌دست‌رفته",
  skipped: "ردشده",
  rest: "استراحت",
};

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_SLOT_FA: Record<MealSlot, string> = {
  breakfast: "صبحانه",
  lunch: "ناهار",
  dinner: "شام",
  snack: "میان‌وعده",
};

/** How a record entered the app; the AI origins must stay visible. */
export type RecordSource = "manual" | "ai_text" | "ai_photo" | "ai_voice" | "import";

export const RECORD_SOURCE_FA: Record<RecordSource, string> = {
  manual: "ورود دستی",
  ai_text: "تخمین متن هوش مصنوعی",
  ai_photo: "تخمین تصویر هوش مصنوعی",
  ai_voice: "تخمین صدای هوش مصنوعی",
  import: "وارداتی",
};

export type AssistantKind = "coach" | "nutritionist";

export const ASSISTANT_FA: Record<AssistantKind, string> = {
  coach: "مربی ورزشی",
  nutritionist: "متخصص تغذیه",
};

export type PlanChangeStatus = "pending" | "confirmed" | "applied" | "rejected" | "reverted";

export const PLAN_CHANGE_STATUS_FA: Record<PlanChangeStatus, string> = {
  pending: "در انتظار تأیید شما",
  confirmed: "تأییدشده",
  applied: "اعمال‌شده",
  rejected: "ردشده",
  reverted: "بازگردانده‌شده",
};


/** Values we computed ourselves must always say so; the spec bans presenting an
 *  estimate as a measurement. */
export type DataQuality = "measured" | "estimated" | "self-reported";

export const DATA_QUALITY_FA: Record<DataQuality, string> = {
  measured: "دقیق",
  estimated: "تقریبی",
  "self-reported": "گزارش خودتان",
};

/* ---------- display entities ---------- */

/**
 * What the cards render. These are the API payloads with the Persian-friendly
 * names the components use; `lib/adapters.ts` is the only place one turns into
 * the other. A field the API does not return has no place here — nothing on
 * screen may look like data the server never sent.
 */

export type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
  restSeconds?: number;
  muscleGroup?: string;
  equipment?: string;
  notes?: string;
  /** Only when the user has logged a set for this exercise. */
  performedWeightKg?: number;
  performedReps?: number;
};

export type Workout = {
  id: string;
  name: string;
  kind: WorkoutKind;
  /** Muscle groups of the exercises, so a card never shows an invented body-part label. */
  muscleGroups: string[];
  scheduledDate?: string;
  intensity: Intensity;
  estimatedMinutes?: number;
  status: WorkoutStatus;
  done: boolean;
  exerciseCount: number;
  /** Optimistic lock token; every write must send it back. */
  version: number;
  /** Session progress within a program — absent when the plan does not define one. */
  sessions?: { completed: number; total: number };
  exercises?: Exercise[];
};

export type MacroTargets = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
};

export type MacroIntake = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
};

export type MealDisplay = {
  id: string;
  slot: MealSlot;
  name: string;
  source: RecordSource;
  confidence?: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  itemCount: number;
};

/** Exactly the metrics the API stores; anything else would be a value we cannot save. */
export type MeasurementMetric =
  | "weight"
  | "bodyFat"
  | "leanMass"
  | "bmi"
  | "waist"
  | "hip"
  | "neck"
  | "restingHeartRate"
  | "soreness";

export const METRIC_FA: Record<MeasurementMetric, string> = {
  weight: "وزن بدن",
  bodyFat: "درصد چربی بدن",
  leanMass: "توده بدون چربی",
  bmi: "شاخص توده بدن",
  waist: "محیط کمر",
  hip: "محیط لگن",
  neck: "محیط گردن",
  restingHeartRate: "ضربان قلب هنگام استراحت",
  soreness: "گرفتگی عضله",
};

export const METRIC_UNIT: Record<MeasurementMetric, "kg" | "percent" | "cm" | "bpm" | "score"> = {
  weight: "kg",
  bodyFat: "percent",
  leanMass: "kg",
  bmi: "score",
  waist: "cm",
  hip: "cm",
  neck: "cm",
  restingHeartRate: "bpm",
  soreness: "score",
};

/** Metrics the API accepts for manual entry; bmi is always derived. */
export const RECORDABLE_METRICS = [
  "weight",
  "bodyFat",
  "leanMass",
  "waist",
  "hip",
  "neck",
  "restingHeartRate",
  "soreness",
] as const satisfies readonly MeasurementMetric[];

/**
 * Who a chat bubble belongs to. The API stores `role: "assistant"` and keeps the
 * assistant kind on the conversation, so the page joins them into one label.
 */
export type ChatRole = "user" | "coach" | "nutritionist";

export const CHAT_ROLE_FA: Record<ChatRole, string> = {
  user: "شما",
  coach: "مربی ورزشی",
  nutritionist: "متخصص تغذیه",
};

/** An authorised change the model proposed but the app has not applied yet. */
export type PlanChange = {
  id: string;
  summary: string;
  detail: string[];
  destructive: boolean;
};
