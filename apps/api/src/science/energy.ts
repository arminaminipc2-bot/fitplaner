import type { ActivityLevel, GoalType, Sex } from "../domain.js";

/**
 * Energy and macro maths. The formulas are the ones the research document
 * names (Mifflin–St Jeor + activity multipliers), and every guardrail below
 * exists because the output feeds eating and training decisions.
 */

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

const GOAL_ADJUSTMENT: Record<GoalType, number> = {
  lose_fat: -0.2,
  gain_muscle: 0.1,
  performance: 0.05,
  health: 0,
  competition: 0,
};

export type EnergyInput = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: GoalType;
};

export type EnergyTargets = {
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  /** Machine codes; the UI owns the Persian sentence for each. */
  warnings: string[];
};

export function bmi(weightKg: number, heightCm: number): number | null {
  if (weightKg <= 0 || heightCm <= 0) return null;
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}

/**
 * Adult BMI categories only. Under 18 they do not apply, and even for adults
 * BMI says nothing about composition — the caller must carry that caveat.
 */
export function bmiCategory(value: number, ageYears: number): string | null {
  if (ageYears < 18) return null;
  if (value < 18.5) return "underweight";
  if (value < 25) return "healthy_range";
  if (value < 30) return "overweight";
  return "obese";
}

export function computeEnergyTargets(input: EnergyInput): EnergyTargets {
  const { sex, ageYears, heightCm, weightKg, activityLevel, goal } = input;
  const warnings: string[] = [];

  const offset = sex === "male" ? 5 : sex === "female" ? -161 : 0;
  if (sex === "other" || sex === "undisclosed") {
    // No midpoint exists in the formula; say the number is less certain
    // instead of inventing one.
    warnings.push("sex_not_specified_bmr_approximate");
  }

  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + offset;
  const tdee = bmr * ACTIVITY_MULTIPLIER[activityLevel];
  let kcal = tdee * (1 + GOAL_ADJUSTMENT[goal]);

  // Never prescribe an intake below BMR, and never below the floors that
  // a coach would consider unsafe for the sex/age given.
  const floor = sex === "female" ? 1200 : 1500;
  if (kcal < floor) {
    warnings.push("deficit_clamped_to_safe_floor");
    kcal = floor;
  }
  if (kcal < bmr) {
    warnings.push("deficit_clamped_to_bmr");
    kcal = Math.max(floor, Math.round(bmr));
  }

  // Rate of change cap: ~1% of body weight per week in a deficit.
  if (goal === "lose_fat") {
    const weeklyKg = ((tdee - kcal) * 7) / 7700;
    if (weeklyKg > weightKg * 0.01) {
      warnings.push("deficit_rate_capped");
      kcal = Math.round(tdee - (weightKg * 0.01 * 7700) / 7);
    }
  }

  if (ageYears < 18) {
    // Restrictive targets are not issued to minors by this app.
    warnings.push("minor_no_restriction");
    if (goal === "lose_fat") kcal = Math.round(tdee);
  }

  const proteinPerKg = goal === "lose_fat" ? 2 : 1.8;
  const proteinG = round(weightKg * proteinPerKg, 0);
  const fatG = round((kcal * 0.25) / 9, 0);
  const carbsG = round(Math.max(60, (kcal - proteinG * 4 - fatG * 9) / 4), 0);
  const waterMl = round(weightKg * 35, 0);

  bmr = Math.round(bmr);
  return {
    bmr,
    tdee: Math.round(tdee),
    kcal: Math.round(kcal),
    proteinG,
    carbsG,
    fatG,
    waterMl,
    warnings,
  };
}

export function ageFrom(birthDate: Date, now = new Date()): number | null {
  if (Number.isNaN(birthDate.getTime())) return null;
  let years = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) years -= 1;
  return years;
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
