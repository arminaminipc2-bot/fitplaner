import { z } from "zod";

/**
 * Server-side vocabulary. SQLite has no enum type, so these string sets are the
 * constraint — the database stores what the API validated, and a Postgres
 * migration can turn each one into a real enum without touching the data.
 */
export const SEX = ["male", "female", "other", "undisclosed"] as const;
export const ACTIVITY_LEVEL = ["sedentary", "light", "moderate", "active", "athlete"] as const;
export const TRAINING_EXPERIENCE = ["beginner", "intermediate", "advanced", "returning"] as const;
export const GOAL_TYPE = ["lose_fat", "gain_muscle", "performance", "health", "competition"] as const;
export const WORKOUT_KIND = ["strength", "cardio", "football", "speed", "recovery", "rest", "match"] as const;
export const INTENSITY = ["low", "moderate", "high", "max"] as const;
export const WORKOUT_STATUS = ["scheduled", "completed", "missed", "skipped", "rest"] as const;
export const MEAL_SLOT = ["breakfast", "lunch", "dinner", "snack"] as const;
export const METRIC = [
  "weight",
  "bodyFat",
  "leanMass",
  "bmi",
  "waist",
  "hip",
  "neck",
  "restingHeartRate",
  "soreness",
] as const;
export const UNIT = ["kg", "cm", "percent", "bpm", "score"] as const;
export const DATA_QUALITY = ["measured", "estimated", "self_reported"] as const;
export const RECORD_SOURCE = ["manual", "ai_text", "ai_photo", "ai_voice", "import"] as const;
export const ASSISTANT = ["coach", "nutritionist"] as const;
export const CHAT_ROLE = ["user", "assistant", "tool"] as const;
export const PROVIDER = ["openai", "anthropic", "gemini", "deepseek", "groq", "ollama", "custom"] as const;
export const PLAN_CHANGE_STATUS = ["pending", "confirmed", "applied", "rejected", "reverted"] as const;
export const TOOL_STATUS = ["pending", "confirmed", "applied", "rejected", "failed"] as const;
export const NOTIFICATION_TYPE = ["workout_reminder", "streak", "plan_change", "ai_summary", "data_gap"] as const;
export const REASONING = ["none", "low", "medium", "high"] as const;

export type Sex = (typeof SEX)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVEL)[number];
export type GoalType = (typeof GOAL_TYPE)[number];
export type Metric = (typeof METRIC)[number];
export type DataQuality = (typeof DATA_QUALITY)[number];

export const zSex = z.enum(SEX);export const zActivityLevel = z.enum(ACTIVITY_LEVEL);
export const zTrainingExperience = z.enum(TRAINING_EXPERIENCE);
export const zGoalType = z.enum(GOAL_TYPE);
export const zWorkoutKind = z.enum(WORKOUT_KIND);
export const zIntensity = z.enum(INTENSITY);
export const zWorkoutStatus = z.enum(WORKOUT_STATUS);
export const zMealSlot = z.enum(MEAL_SLOT);
export const zMetric = z.enum(METRIC);
export const zUnit = z.enum(UNIT);
export const zDataQuality = z.enum(DATA_QUALITY);
export const zRecordSource = z.enum(RECORD_SOURCE);
export const zAssistant = z.enum(ASSISTANT);
export const zProvider = z.enum(PROVIDER);

/** "YYYY-MM-DD" in, Date out — kept as UTC midnight so a Jalali day never shifts. */
export const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

export const zOptionalDate = zDate.optional();

export const zIsoDateTime = z.string().datetime({ offset: true }).transform((s) => new Date(s));

export const zId = z.string().min(8).max(64);

export const zEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email());

/** Persian UI uses a numeric keypad; "۷۶.۵" must not reach the API as text. */
export const zNumber = z.coerce.number().finite();

export const zPositive = zNumber.positive();
export const zNonNegative = zNumber.nonnegative();
