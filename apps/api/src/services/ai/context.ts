import { prisma } from "../../db.js";
import { ageFrom, bmi } from "../../science/energy.js";
import { faNumber } from "../../text.js";

/**
 * The compact, permission-aware slice of the profile that is handed to a model.
 * Not a profile dump: each assistant only sees the fields its own role needs,
 * and nothing that belongs to credentials or encrypted columns.
 */

export type AssistantKind = "coach" | "nutritionist";

export type ProfileContext = {
  assistant: AssistantKind;
  /** Persian, keyed-free text block injected into the system prompt. */
  text: string;
  /** What was actually sent, stored on AiConversation.contextJson (spec §14). */
  snapshot: Record<string, unknown>;
  /** Preference gate: Phase 6 may only propose plan writes when this is true. */
  allowAiPlanEdits: boolean;
  isMinor: boolean;
};

const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

const SEX_FA: Record<string, string> = {
  male: "مرد",
  female: "زن",
  other: "دیگر",
  undisclosed: "اعلام‌نشده",
};

const GOAL_FA: Record<string, string> = {
  lose_fat: "کاهش چربی",
  gain_muscle: "افزایش عضله",
  performance: "عملکرد ورزشی",
  health: "سلامت عمومی",
  competition: "آمادگی مسابقه",
};

const EXPERIENCE_FA: Record<string, string> = {
  beginner: "مبتدی",
  intermediate: "متوسط",
  advanced: "پیشرفته",
  returning: "بازگشت پس از وقفه",
};

const ACTIVITY_FA: Record<string, string> = {
  sedentary: "کم‌تحرک",
  light: "کم",
  moderate: "متوسط",
  active: "زیاد",
  athlete: "ورزشکار",
};

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value);

export async function buildProfileContext(
  userId: string,
  assistant: AssistantKind,
): Promise<ProfileContext> {
  const [profile, measurements, target, goals, preferences] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.bodyMeasurement.findMany({
      where: { userId, metric: { in: ["weight", "bodyFat", "restingHeartRate"] } },
      orderBy: { takenAt: "desc" },
      take: 12,
    }),
    prisma.nutritionTarget.findFirst({
      where: { userId },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.fitnessGoal.findMany({ where: { userId, status: "active" }, take: 5 }),
    prisma.userPreference.findMany({ where: { userId, key: "coach" } }),
  ]);

  const ageYears = profile?.birthDate ? ageFrom(profile.birthDate) : null;
  const isMinor = ageYears !== null && ageYears < 18;

  const weight = measurements.find((m) => m.metric === "weight");
  const bodyFat = measurements.find((m) => m.metric === "bodyFat");
  const restingHeartRate = measurements.find((m) => m.metric === "restingHeartRate");
  const value = profile?.heightCm && weight ? bmi(weight.value, profile.heightCm) : null;

  let allowAiPlanEdits = false;
  for (const row of preferences) {
    try {
      const parsed = JSON.parse(row.value) as { allowAiPlanEdits?: unknown };
      allowAiPlanEdits = parsed.allowAiPlanEdits === true;
    } catch {
      allowAiPlanEdits = false;
    }
  }

  const lines: string[] = [];
  const snapshot: Record<string, unknown> = { assistant };

  lines.push(
    profile?.displayName
      ? `نام نمایشی: ${clip(profile.displayName, 60)}`
      : "نام نمایشی: ثبت‌ نشده",
  );

  if (ageYears !== null) {
    snapshot.ageYears = ageYears;
    lines.push(`سن: ${faNumber(ageYears)} سال${isMinor ? " (زیر ۱۸ سال — مراقبت‌های نوجوان اعمال می‌شود)" : ""}`);
  } else {
    lines.push("سن: در پروفایل نیست. اگر پاسخ به سن وابسته است، آن را بپرس و فرض نکن.");
  }

  if (assistant === "coach") {
    if (profile?.sex) {
      snapshot.sex = profile.sex;
      lines.push(`جنسیت: ${SEX_FA[profile.sex] ?? profile.sex}`);
    }
    if (profile?.trainingExperience) {
      snapshot.trainingExperience = profile.trainingExperience;
      lines.push(`سابقهٔ تمرین: ${EXPERIENCE_FA[profile.trainingExperience] ?? profile.trainingExperience}`);
    }
    if (profile?.activityLevel) {
      snapshot.activityLevel = profile.activityLevel;
      lines.push(`سطح فعالیت روزانه: ${ACTIVITY_FA[profile.activityLevel] ?? profile.activityLevel}`);
    }
    if (profile?.maxWorkoutMinutes) {
      snapshot.maxWorkoutMinutes = profile.maxWorkoutMinutes;
      lines.push(`حداکثر زمان هر جلسه: ${faNumber(profile.maxWorkoutMinutes)} دقیقه`);
    }
    if (profile?.trainingDays) {
      try {
        const days = (JSON.parse(profile.trainingDays) as number[]).map((d) => WEEKDAYS[d]).filter(Boolean);
        if (days.length) {
          snapshot.trainingDays = days;
          lines.push(`روزهای تمرین: ${days.join("، ")}`);
        }
      } catch {
        /* stored as something else — treated as unknown, never guessed */
      }
    }
    if (profile?.injuries) {
      snapshot.hasInjuries = true;
      lines.push(`آسیب گزارش‌شده: ${clip(profile.injuries, 220)}`);
    } else {
      snapshot.hasInjuries = false;
    }
  }

  if (assistant === "nutritionist") {
    if (profile?.dietaryRestrictions) {
      snapshot.dietaryRestrictions = clip(profile.dietaryRestrictions, 220);
      lines.push(`محدودیت غذایی: ${snapshot.dietaryRestrictions}`);
    }
    if (profile?.dislikedFoods) {
      snapshot.dislikedFoods = clip(profile.dislikedFoods, 160);
      lines.push(`غذاهایی که دوست ندارد: ${snapshot.dislikedFoods}`);
    }
    if (profile?.preferredFoods) {
      snapshot.preferredFoods = clip(profile.preferredFoods, 160);
      lines.push(`غذاهای مورد علاقه: ${snapshot.preferredFoods}`);
    }
    if (target) {
      snapshot.nutritionTarget = {
        kcal: target.kcal,
        proteinG: target.proteinG,
        carbsG: target.carbsG,
        fatG: target.fatG,
        waterMl: target.waterMl,
        source: target.source,
      };
      lines.push(
        `هدف غذایی فعلی: ${faNumber(target.kcal)} کیلوکالری، پروتئین ${faNumber(target.proteinG)} گرم، کربوهیدرات ${faNumber(target.carbsG)} گرم، چربی ${faNumber(target.fatG)} گرم، آب ${faNumber(target.waterMl)} میلی‌لیتر`,
      );
    } else {
      lines.push("هدف غذایی ثبت‌شده‌ای وجود ندارد؛ اعدادت را برچسب‌دار و به‌عنوان تخمین بیان کن.");
    }
  }

  if (profile?.heightCm) {
    snapshot.heightCm = profile.heightCm;
    lines.push(`قد: ${faNumber(profile.heightCm)} سانتی‌متر`);
  }
  if (weight) {
    snapshot.weightKg = weight.value;
    snapshot.weightTakenAt = weight.takenAt.toISOString().slice(0, 10);
    snapshot.weightQuality = weight.quality;
    lines.push(
      `وزن: ${faNumber(weight.value)} کیلوگرم (تاریخ: ${snapshot.weightTakenAt}، کیفیت داده: ${weight.quality})`,
    );
  } else {
    lines.push("وزن تازه‌ای ثبت نشده است.");
  }
  if (bodyFat) {
    snapshot.bodyFatPct = bodyFat.value;
    lines.push(`درصد چربی بدن: ${faNumber(bodyFat.value)}٪`);
  }
  if (restingHeartRate) {
    snapshot.restingHeartRate = restingHeartRate.value;
    lines.push(`ضربان هنگام استراحت: ${faNumber(restingHeartRate.value)} bpm`);
  }
  if (value !== null) {
    snapshot.bmi = value;
    lines.push(
      isMinor
        ? `BMI خام: ${faNumber(value)} — کاربر زیر ۱۸ سال است: دسته‌بندی بزرگ‌سالان روی آن اعمال نمی‌شود و این عدد به‌تنهایی سنجش آمادگی نیست.`
        : `BMI: ${faNumber(value)} — یک عدد راهنماست، نه سنجش کامل آمادگی جسمانی (تودهٔ عضلانی و توزیع چربی را نمی‌بیند).`,
    );
  }
  if (isMinor) snapshot.isMinor = true;

  if (goals.length) {
    snapshot.goals = goals.map((g) => g.type);
    lines.push(`هدف‌های فعال: ${goals.map((g) => GOAL_FA[g.type] ?? g.type).join("، ")}`);
  } else if (profile?.goal) {
    snapshot.goals = [profile.goal];
    lines.push(`هدف: ${GOAL_FA[profile.goal] ?? profile.goal}`);
  }

  // Presence, never a free-text dump: the model is told a condition exists so it
  // refers the user to a clinician, without the raw medical record going out.
  if (profile?.medicalConditions) {
    snapshot.medicalConditionsPresent = true;
    lines.push("در پروفایل یک یا چند شرط پزشکی ثبت شده است: برای هر توصیه‌ای که به آن ربط دارد، کاربر را به پزشک ارجاع بده.");
  } else {
    snapshot.medicalConditionsPresent = false;
  }
  if (profile?.medications) {
    snapshot.medicationsPresent = true;
    lines.push("کاربر دارو مصرف می‌کند: هرگز در مورد دوز یا قطع دارو نظر نده و تداخل را با پزشک یا داروساز بررسی کن.");
  } else {
    snapshot.medicationsPresent = false;
  }

  if (profile?.equipmentNotes && assistant === "coach") {
    snapshot.equipmentNotes = clip(profile.equipmentNotes, 160);
    lines.push(`تجهیزات در دسترس: ${snapshot.equipmentNotes}`);
  }

  snapshot.allowAiPlanEdits = allowAiPlanEdits;

  return {
    assistant,
    text: lines.join("\n"),
    snapshot,
    allowAiPlanEdits,
    isMinor,
  };
}
