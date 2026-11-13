import type { Response } from "supertest";
import { prisma } from "../src/db.js";

export async function clearDb() {
  // Order matters only for readability; SQLite has no FK enforcement here,
  // and every table is keyed by userId anyway.
  await prisma.$transaction([
    prisma.exercisePerformance.deleteMany(),
    prisma.workoutSession.deleteMany(),
    prisma.exercise.deleteMany(),
    prisma.foodItem.deleteMany(),
    prisma.meal.deleteMany(),
    prisma.mealPlan.deleteMany(),
    prisma.waterRecord.deleteMany(),
    prisma.nutritionTarget.deleteMany(),
    prisma.weeklySchedule.deleteMany(),
    prisma.workout.deleteMany(),
    prisma.trainingProgram.deleteMany(),
    prisma.aiMessage.deleteMany(),
    prisma.aiToolExecutionLog.deleteMany(),
    prisma.planChange.deleteMany(),
    prisma.aiConversation.deleteMany(),
    prisma.aiModelConfig.deleteMany(),
    prisma.aiProviderConfig.deleteMany(),
    prisma.progressRecord.deleteMany(),
    prisma.bodyMeasurement.deleteMany(),
    prisma.fitnessGoal.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.userPreference.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.authSession.deleteMany(),
    prisma.profile.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

/** The session cookie from a register/login response, ready for the next call. */
export function cookie(res: Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const value = raw?.find((c) => c.startsWith("fitplaner_session=")) ?? "";
  return value.split(";")[0];
}

export function newEmail(tag: string): string {
  return `${tag}.${Math.random().toString(36).slice(2, 8)}@example.test`;
}
