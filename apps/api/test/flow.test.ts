import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { clearDb, cookie, newEmail } from "./helpers.js";

describe("signup → measurement → workout → meal", () => {
  beforeEach(clearDb);

  it("runs the whole first-week journey against the database", async () => {
    const app = createApp();
    const email = newEmail("journey");

    const registered = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "kashefi-1384", displayName: "آرش" })
      .expect(201);
    const auth = cookie(registered);
    expect(registered.body.data.id).toMatch(/^[a-z0-9_]+$/i);

    // A second account must not be able to read this one's rows.
    const other = await request(app)
      .post("/api/auth/register")
      .send({ email: newEmail("other"), password: "kashefi-1384" })
      .expect(201);
    await request(app).get("/api/measurements").set("Cookie", cookie(other)).expect(200);

    const me = await request(app).get("/api/auth/me").set("Cookie", auth).expect(200);
    expect(me.body.data.user.email).toBe(email);

    // Onboarding step 1: the basics the energy maths needs.
    await request(app)
      .patch("/api/profile")
      .set("Cookie", auth)
      .send({ sex: "male", birthDate: "1990-05-10T00:00:00.000Z", heightCm: 178, activityLevel: "moderate", goal: "lose_fat", trainingExperience: "intermediate", onboardingStep: 2 })
      .expect(200);

    const measurement = await request(app)
      .post("/api/measurements")
      .set("Cookie", auth)
      .send({ metric: "weight", value: 82.4, takenAt: "2026-11-01", quality: "measured" })
      .expect(201);
    expect(measurement.body.data.unit).toBe("kg");

    await request(app)
      .post("/api/measurements")
      .set("Cookie", auth)
      .send({ metric: "weight", value: 900, takenAt: "2026-11-01" })
      .expect(422);

    // A workout with two exercises.
    const created = await request(app)
      .post("/api/training/workouts")
      .set("Cookie", auth)
      .send({
        date: "2026-11-02",
        kind: "strength",
        title: "بالاتنه فشاری",
        intensity: "moderate",
        estimatedMinutes: 55,
        exercises: [
          { name: "پرس سینه هالتر", sets: 4, reps: "6-8", restSeconds: 150 },
          { name: "پرس شانه دمبل", sets: 3, reps: "10", restSeconds: 90 },
        ],
      })
      .expect(201);
    const workoutId = created.body.data.id;
    expect(created.body.data.exercises).toHaveLength(2);

    const listed = await request(app)
      .get("/api/training/workouts")
      .query({ from: "2026-11-01", to: "2026-11-07" })
      .set("Cookie", auth)
      .expect(200);
    expect(listed.body.data.items).toHaveLength(1);

    // Completing it is a status write, and the version moves.
    const done = await request(app)
      .post(`/api/training/workouts/${workoutId}/status`)
      .set("Cookie", auth)
      .send({ status: "completed", version: created.body.data.version })
      .expect(200);
    expect(done.body.data.status).toBe("completed");

    // Stale version → conflict, not a silent overwrite.
    await request(app)
      .patch(`/api/training/workouts/${workoutId}`)
      .set("Cookie", auth)
      .send({ title: "بالاتنه فشاری — تغییر", version: created.body.data.version })
      .expect(409);

    const patched = await request(app)
      .patch(`/api/training/workouts/${workoutId}`)
      .set("Cookie", auth)
      .send({ title: "بالاتنه فشاری — تغییر", version: done.body.data.version })
      .expect(200);
    expect(patched.body.data.version).toBe(done.body.data.version + 1);

    // Another user's workout is invisible, not merely un-writable.
    await request(app)
      .get(`/api/training/workouts/${workoutId}`)
      .set("Cookie", cookie(other))
      .expect(404);

    // A meal with items; totals are computed server-side.
    const meal = await request(app)
      .post("/api/nutrition/meals")
      .set("Cookie", auth)
      .send({
        date: "2026-11-02",
        slot: "lunch",
        name: "خورشت مرغ",
        items: [
          { name: "برنج پخته", amount: 250, unit: "g", kcal: 325, proteinG: 7, carbsG: 70, fatG: 1, source: "manual" },
          { name: "سینه مرغ", amount: 150, unit: "g", kcal: 248, proteinG: 46, carbsG: 0, fatG: 5, source: "manual" },
        ],
      })
      .expect(201);
    expect(meal.body.data.totals).toEqual({ kcal: 573, proteinG: 53, carbsG: 70, fatG: 6 });

    const corrected = await request(app)
      .patch(`/api/nutrition/meals/${meal.body.data.id}`)
      .set("Cookie", auth)
      .send({ version: meal.body.data.version, items: [{ name: "برنج پخته", amount: 200, unit: "g", kcal: 260, proteinG: 5.6, carbsG: 56, fatG: 0.8, source: "manual" }] })
      .expect(200);
    expect(corrected.body.data.totals.kcal).toBe(260);

    await request(app).post("/api/nutrition/water").set("Cookie", auth).send({ amountMl: 400 }).expect(201);

    const targets = await request(app).post("/api/nutrition/targets/suggest").set("Cookie", auth).expect(200);
    expect(targets.body.data.kcal).toBeGreaterThan(targets.body.data.bmr);
    await request(app)
      .put("/api/nutrition/targets")
      .set("Cookie", auth)
      .send({ effectiveFrom: "2026-11-01", kcal: targets.body.data.kcal, proteinG: targets.body.data.proteinG, carbsG: targets.body.data.carbsG, fatG: targets.body.data.fatG, waterMl: 2800 })
      .expect(200);

    const home = await request(app).get("/api/home").set("Cookie", auth).expect(200);
    expect(home.body.data.nutrition.target?.kcal).toBe(targets.body.data.kcal);
    expect(home.body.data.ai.configured).toBe(false);

    const progress = await request(app)
      .get("/api/progress")
      .query({ days: 7, until: "2026-11-07" })
      .set("Cookie", auth)
      .expect(200);
    expect(progress.body.data.summary.workoutsDone).toBe(1);
    expect(progress.body.data.days).toHaveLength(7);

    // Logout revokes the session row, so the cookie is dead, not just cleared.
    await request(app).post("/api/auth/logout").set("Cookie", auth).expect(200);
    await request(app).get("/api/home").set("Cookie", auth).expect(401);
    expect(await prisma.authSession.count()).toBe(1); // the other account's
  }, 30_000);
});
