import { Router } from "express";
import { z } from "zod";
import type { Profile } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import {
  zActivityLevel,
  zGoalType,
  zSex,
  zTrainingExperience,
  zIsoDateTime,
} from "../domain.js";
import { ageFrom } from "../science/energy.js";
import { AppError, ok, parseBody, uid } from "../http.js";

export const profileRouter = Router();

const profileSchema = z.object({
  displayName: z.string().trim().max(60).nullish(),
  sex: zSex.nullish(),
  birthDate: zIsoDateTime.nullish(),
  heightCm: z.number().min(80).max(250).nullish(),
  activityLevel: zActivityLevel.nullish(),
  trainingExperience: zTrainingExperience.nullish(),
  goal: zGoalType.nullish(),
  injuries: z.string().trim().max(1000).nullish(),
  medicalConditions: z.string().trim().max(1000).nullish(),
  medications: z.string().trim().max(1000).nullish(),
  dietaryRestrictions: z.string().trim().max(1000).nullish(),
  dislikedFoods: z.string().trim().max(1000).nullish(),
  preferredFoods: z.string().trim().max(1000).nullish(),
  equipmentNotes: z.string().trim().max(1000).nullish(),
  maxWorkoutMinutes: z.number().int().min(10).max(240).nullish(),
  trainingDays: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .nullish(),
  onboardingStep: z.number().int().min(0).max(6).nullish(),
});

function serialize(p: Profile) {
  return {
    displayName: p.displayName,
    sex: p.sex,
    birthDate: p.birthDate ? p.birthDate.toISOString() : null,
    ageYears: p.birthDate ? ageFrom(p.birthDate) : null,
    heightCm: p.heightCm,
    activityLevel: p.activityLevel,
    trainingExperience: p.trainingExperience,
    goal: p.goal,
    injuries: p.injuries,
    medicalConditions: p.medicalConditions,
    medications: p.medications,
    dietaryRestrictions: p.dietaryRestrictions,
    dislikedFoods: p.dislikedFoods,
    preferredFoods: p.preferredFoods,
    equipmentNotes: p.equipmentNotes,
    maxWorkoutMinutes: p.maxWorkoutMinutes,
    trainingDays: p.trainingDays ? (JSON.parse(p.trainingDays) as number[]) : [],
    onboardingStep: p.onboardingStep,
    onboardingCompleted: Boolean(p.onboardingCompletedAt),
  };
}

async function load(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
}

profileRouter.get("/", async (req, res) => {
  const user = await load(uid(req));
  ok(res, {
    email: user?.email,
    profile: user?.profile ? serialize(user.profile) : null,
  });
});

/** Partial update: onboarding posts one step at a time, so absent keys stay put. */
profileRouter.patch("/", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(profileSchema, req.body);
  const data: Record<string, unknown> = { ...body };
  if (body.trainingDays) data.trainingDays = JSON.stringify(body.trainingDays);
  if (body.onboardingStep === 6) data.onboardingCompletedAt = new Date();

  const profile = await prisma.profile.upsert({
    where: { userId },
    create: { userId, ...(data as object) },
    update: data,
  });

  ok(res, serialize(profile));
});

// ---------- preferences ----------

const PREFERENCES = {
  units: z.object({ weight: z.enum(["kg", "lb"]), length: z.enum(["cm", "in"]) }),
  reminders: z.object({
    workout: z.boolean(),
    water: z.boolean(),
    weighIn: z.boolean(),
    quietFrom: z.string().regex(/^\d{2}:\d{2}$/),
    quietTo: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  coach: z.object({
    tone: z.enum(["concise", "detailed", "supportive"]),
    strictness: z.enum(["gentle", "balanced", "demanding"]),
    allowAiPlanEdits: z.boolean(),
  }),
} as const;

type PreferenceKey = keyof typeof PREFERENCES;

profileRouter.get("/preferences", async (req, res) => {
  const rows = await prisma.userPreference.findMany({ where: { userId: uid(req) } });
  const out: Record<string, unknown> = {};
  for (const row of rows) out[row.key] = JSON.parse(row.value);
  ok(res, out);
});

profileRouter.put("/preferences/:key", async (req, res) => {
  const key = req.params.key as PreferenceKey;
  const schema = PREFERENCES[key];
  if (!schema) {
    throw new AppError(422, "unknown_preference", "این تنظیم شناخته‌شده نیست.");
  }
  const value = parseBody(schema, req.body);
  const userId = uid(req);
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
  ok(res, { [key]: value });
});
