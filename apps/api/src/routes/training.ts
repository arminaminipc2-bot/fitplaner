import { Router } from "express";
import { z } from "zod";
import type { Exercise, Workout } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import {
  WORKOUT_STATUS,
  zDate,
  zId,
  zIntensity,
  zIsoDateTime,
  zWorkoutKind,
} from "../domain.js";
import { AppError, ok, parseBody, uid } from "../http.js";

export const trainingRouter = Router();

const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  muscleGroup: z.string().trim().max(60).optional(),
  equipment: z.string().trim().max(60).optional(),
  sets: z.number().int().min(1).max(20),
  reps: z.string().trim().min(1).max(30),
  restSeconds: z.number().int().min(0).max(900).optional(),
  tempo: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
  orderIndex: z.number().int().min(0).max(99).optional(),
});

const workoutSchema = z.object({
  date: zDate,
  kind: zWorkoutKind,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  intensity: zIntensity.default("moderate"),
  estimatedMinutes: z.number().int().min(5).max(600).optional(),
  programId: zId.optional(),
  exercises: z.array(exerciseSchema).max(40).optional(),
});

function serializeExercise(e: Exercise) {
  return {
    id: e.id,
    name: e.name,
    muscleGroup: e.muscleGroup,
    equipment: e.equipment,
    sets: e.sets,
    reps: e.reps,
    restSeconds: e.restSeconds,
    tempo: e.tempo,
    notes: e.notes,
    orderIndex: e.orderIndex,
  };
}

function serializeWorkout(w: Workout & { exercises?: Exercise[] }) {
  return {
    id: w.id,
    date: w.date.toISOString(),
    kind: w.kind,
    title: w.title,
    description: w.description,
    intensity: w.intensity,
    estimatedMinutes: w.estimatedMinutes,
    status: w.status,
    completedAt: w.completedAt ? w.completedAt.toISOString() : null,
    programId: w.programId,
    notes: w.notes,
    version: w.version,
    exercises: (w.exercises ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex).map(serializeExercise),
  };
}

/** A workout the caller owns, or a 404 — never another user's row. */
async function ownedWorkout(userId: string, id: string) {
  const found = await prisma.workout.findFirst({
    where: { id, userId },
    include: { exercises: true },
  });
  if (!found) throw AppError.notFound("تمرین");
  return found;
}

trainingRouter.get("/workouts", async (req, res) => {
  const userId = uid(req);
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;

  const workouts = await prisma.workout.findMany({
    where: { userId, ...(from || to ? { date: { gte: from, lte: to } } : {}) },
    include: { exercises: true },
    orderBy: { date: "asc" },
  });
  ok(res, { items: workouts.map(serializeWorkout) });
});

trainingRouter.get("/workouts/:id", async (req, res) => {
  ok(res, serializeWorkout(await ownedWorkout(uid(req), req.params.id)));
});

trainingRouter.post("/workouts", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(workoutSchema, req.body);

  if (body.programId) {
    const program = await prisma.trainingProgram.findFirst({ where: { id: body.programId, userId } });
    if (!program) throw AppError.notFound("برنامه تمرینی");
  }

  const created = await prisma.workout.create({
    data: {
      userId,
      programId: body.programId ?? null,
      date: body.date,
      kind: body.kind,
      title: body.title,
      description: body.description ?? null,
      intensity: body.intensity,
      estimatedMinutes: body.estimatedMinutes ?? null,
      exercises: {
        create: (body.exercises ?? []).map((e, i) => ({
          userId,
          name: e.name,
          muscleGroup: e.muscleGroup ?? null,
          equipment: e.equipment ?? null,
          sets: e.sets,
          reps: e.reps,
          restSeconds: e.restSeconds ?? 90,
          tempo: e.tempo ?? null,
          notes: e.notes ?? null,
          orderIndex: e.orderIndex ?? i,
        })),
      },
    },
    include: { exercises: true },
  });

  ok(res, serializeWorkout(created), 201);
});

/**
 * Patch with optimistic locking. The AI coach and the user can both be holding
 * the same workout open; whoever arrives second gets a conflict instead of
 * silently overwriting the first edit (spec §11.4).
 */
trainingRouter.patch("/workouts/:id", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(
    workoutSchema.partial().extend({ version: z.number().int().min(1) }),
    req.body,
  );

  const current = await ownedWorkout(userId, req.params.id);
  if (body.version !== current.version) {
    throw AppError.conflict(
      "version_conflict",
      "این تمرین هم‌زمان تغییر کرده است. آخرین نسخه را بارگذاری کنید.",
    );
  }

  const { exercises, programId, ...scalar } = body;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.workout.update({
      where: { id: current.id },
      data: {
        ...(scalar.date !== undefined ? { date: scalar.date } : {}),
        ...(scalar.kind !== undefined ? { kind: scalar.kind } : {}),
        ...(scalar.title !== undefined ? { title: scalar.title } : {}),
        ...(scalar.description !== undefined ? { description: scalar.description } : {}),
        ...(scalar.intensity !== undefined ? { intensity: scalar.intensity } : {}),
        ...(scalar.estimatedMinutes !== undefined ? { estimatedMinutes: scalar.estimatedMinutes } : {}),
        ...(programId !== undefined ? { programId: programId ?? null } : {}),
        version: { increment: 1 },
      },
      include: { exercises: true },
    });

    if (exercises) {
      await tx.exercise.deleteMany({ where: { workoutId: row.id } });
      await tx.exercise.createMany({
        data: exercises.map((e, i) => ({
          workoutId: row.id,
          userId,
          name: e.name,
          muscleGroup: e.muscleGroup ?? null,
          equipment: e.equipment ?? null,
          sets: e.sets,
          reps: e.reps,
          restSeconds: e.restSeconds ?? 90,
          tempo: e.tempo ?? null,
          notes: e.notes ?? null,
          orderIndex: e.orderIndex ?? i,
        })),
      });
      row.exercises = await tx.exercise.findMany({ where: { workoutId: row.id } });
    }
    return row;
  });

  ok(res, serializeWorkout(updated));
});

trainingRouter.delete("/workouts/:id", async (req, res) => {
  const userId = uid(req);
  const deleted = await prisma.workout.deleteMany({ where: { id: req.params.id, userId } });
  if (deleted.count === 0) throw AppError.notFound("تمرین");
  ok(res, { deleted: true });
});

/** Completing a workout is a status write, not a delete-and-recreate. */
trainingRouter.post("/workouts/:id/status", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(
    z.object({ status: z.enum(WORKOUT_STATUS), version: z.number().int().min(1).optional() }),
    req.body,
  );
  const current = await ownedWorkout(userId, req.params.id);
  if (body.version !== undefined && body.version !== current.version) {
    throw AppError.conflict("version_conflict", "این تمرین هم‌زمان تغییر کرده است.");
  }

  const updated = await prisma.workout.update({
    where: { id: current.id },
    data: {
      status: body.status,
      completedAt: body.status === "completed" ? new Date() : null,
      version: { increment: 1 },
    },
    include: { exercises: true },
  });
  ok(res, serializeWorkout(updated));
});

// ---------- exercises ----------

trainingRouter.post("/workouts/:id/exercises", async (req, res) => {
  const userId = uid(req);
  const workout = await ownedWorkout(userId, req.params.id);
  const body = parseBody(exerciseSchema, req.body);

  const created = await prisma.exercise.create({
    data: {
      workoutId: workout.id,
      userId,
      name: body.name,
      muscleGroup: body.muscleGroup ?? null,
      equipment: body.equipment ?? null,
      sets: body.sets,
      reps: body.reps,
      restSeconds: body.restSeconds ?? 90,
      tempo: body.tempo ?? null,
      notes: body.notes ?? null,
      orderIndex: body.orderIndex ?? workout.exercises.length,
    },
  });
  await prisma.workout.update({ where: { id: workout.id }, data: { version: { increment: 1 } } });
  ok(res, serializeExercise(created), 201);
});

trainingRouter.patch("/exercises/:id", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(exerciseSchema.partial(), req.body);
  const existing = await prisma.exercise.findFirst({
    where: { id: req.params.id },
    include: { workout: { select: { userId: true } } },
  });
  if (!existing || existing.workout.userId !== userId) throw AppError.notFound("حرکت");

  const updated = await prisma.exercise.update({ where: { id: existing.id }, data: body });
  await prisma.workout.update({ where: { id: existing.workoutId }, data: { version: { increment: 1 } } });
  ok(res, serializeExercise(updated));
});

trainingRouter.delete("/exercises/:id", async (req, res) => {
  const userId = uid(req);
  const existing = await prisma.exercise.findFirst({
    where: { id: req.params.id },
    include: { workout: { select: { userId: true } } },
  });
  if (!existing || existing.workout.userId !== userId) throw AppError.notFound("حرکت");

  await prisma.$transaction([
    prisma.exercise.delete({ where: { id: existing.id } }),
    prisma.workout.update({ where: { id: existing.workoutId }, data: { version: { increment: 1 } } }),
  ]);
  ok(res, { deleted: true });
});

// ---------- sessions (what actually happened) ----------

const performanceSchema = z.object({
  exerciseId: zId,
  setIndex: z.number().int().min(1).max(30),
  reps: z.number().int().min(0).max(500).optional(),
  weightKg: z.number().min(0).max(500).optional(),
  distanceM: z.number().min(0).max(100000).optional(),
  seconds: z.number().int().min(0).max(86400).optional(),
  rpe: z.number().min(1).max(10).optional(),
  note: z.string().trim().max(300).optional(),
});

trainingRouter.post("/workouts/:id/sessions", async (req, res) => {
  const userId = uid(req);
  const workout = await ownedWorkout(userId, req.params.id);
  const body = parseBody(
    z.object({
      startedAt: zIsoDateTime.optional(),
      endedAt: zIsoDateTime.optional(),
      durationMinutes: z.number().int().min(1).max(600).optional(),
      rpe: z.number().min(1).max(10).optional(),
      caloriesBurned: z.number().min(0).max(5000).optional(),
      notes: z.string().trim().max(1000).optional(),
      performances: z.array(performanceSchema).max(200).optional(),
    }),
    req.body,
  );

  const foreign = (body.performances ?? []).filter(
    (p) => !workout.exercises.some((e) => e.id === p.exerciseId),
  );
  if (foreign.length > 0) {
    throw AppError.validation({ performances: "یکی از حرکت‌ها به این تمرین تعلق ندارد." });
  }

  const session = await prisma.workoutSession.create({
    data: {
      userId,
      workoutId: workout.id,
      startedAt: body.startedAt ?? new Date(),
      endedAt: body.endedAt ?? null,
      durationMinutes: body.durationMinutes ?? null,
      rpe: body.rpe ?? null,
      caloriesBurned: body.caloriesBurned ?? null,
      notes: body.notes ?? null,
      performances: {
        create: (body.performances ?? []).map((p) => ({
          exerciseId: p.exerciseId,
          userId,
          setIndex: p.setIndex,
          reps: p.reps ?? null,
          weightKg: p.weightKg ?? null,
          distanceM: p.distanceM ?? null,
          seconds: p.seconds ?? null,
          rpe: p.rpe ?? null,
          note: p.note ?? null,
        })),
      },
    },
    include: { performances: true },
  });

  ok(res, { id: session.id, performances: session.performances.length }, 201);
});

// ---------- programs ----------

const programSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  startDate: zDate,
  endDate: zDate.optional(),
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  focus: z.string().trim().max(120).optional(),
  status: z.enum(["active", "paused", "completed", "archived"]).default("active"),
});

trainingRouter.get("/programs", async (req, res) => {
  const items = await prisma.trainingProgram.findMany({
    where: { userId: uid(req) },
    orderBy: { startDate: "desc" },
    include: { schedules: true },
  });
  ok(res, {
    items: items.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      startDate: p.startDate.toISOString(),
      endDate: p.endDate ? p.endDate.toISOString() : null,
      daysPerWeek: p.daysPerWeek,
      focus: p.focus,
      status: p.status,
      source: p.source,
      version: p.version,
      schedules: p.schedules.map((s) => ({
        id: s.id,
        weekStart: s.weekStart.toISOString(),
        dayOfWeek: s.dayOfWeek,
        kind: s.kind,
        title: s.title,
        startTime: s.startTime,
        enabled: s.enabled,
      })),
    })),
  });
});

trainingRouter.post("/programs", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(programSchema, req.body);
  const created = await prisma.trainingProgram.create({
    data: {
      userId,
      name: body.name,
      description: body.description ?? null,
      startDate: body.startDate,
      endDate: body.endDate ?? null,
      daysPerWeek: body.daysPerWeek ?? null,
      focus: body.focus ?? null,
      status: body.status,
    },
  });
  ok(res, { id: created.id, name: created.name, version: created.version }, 201);
});

trainingRouter.patch("/programs/:id", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(programSchema.partial().omit({ startDate: true }), req.body);
  const current = await prisma.trainingProgram.findFirst({ where: { id: req.params.id, userId } });
  if (!current) throw AppError.notFound("برنامه تمرینی");

  const updated = await prisma.trainingProgram.update({
    where: { id: current.id },
    data: { ...body, version: { increment: 1 } },
  });
  ok(res, { id: updated.id, version: updated.version });
});

trainingRouter.delete("/programs/:id", async (req, res) => {
  const userId = uid(req);
  const deleted = await prisma.trainingProgram.deleteMany({ where: { id: req.params.id, userId } });
  if (deleted.count === 0) throw AppError.notFound("برنامه تمرینی");
  ok(res, { deleted: true });
});
