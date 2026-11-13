import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { clearDb, cookie, newEmail } from "./helpers.js";
import { installFetch, jsonResponse, type FetchStub } from "./fake-fetch.js";

/**
 * Phase 6: a model's tool call is a proposal, the user applies it, and the same
 * change can be reverted from its stored snapshot. The suite never contacts a
 * provider.
 */

const KEY = "sk-test-plan-changes-1234";
let stub: FetchStub;

beforeEach(async () => {
  await clearDb();
  stub?.restore();
});
afterEach(() => stub?.restore());

async function signIn(app: ReturnType<typeof createApp>, tag: string) {
  const email = newEmail(tag);
  const res = await request(app).post("/api/auth/register").send({ email, password: "kashefi-1384" }).expect(201);
  return { auth: cookie(res) };
}

async function addProvider(app: ReturnType<typeof createApp>, auth: string) {
  const res = await request(app)
    .post("/api/ai/providers")
    .set("Cookie", auth)
    .send({ provider: "openai", label: "کلید تست", apiKey: KEY })
    .expect(201);
  return res.body.data.id as string;
}

async function newConversation(app: ReturnType<typeof createApp>, auth: string, assistant = "coach") {
  const res = await request(app)
    .post("/api/chat/conversations")
    .set("Cookie", auth)
    .send({ assistant })
    .expect(201);
  return res.body.data.id as string;
}

const toolCompletion = (name: string, args: unknown, text = "پیشنهاد آماده است.") =>
  jsonResponse({
    model: "gpt-4o-mini",
    choices: [
      {
        message: {
          content: text,
          tool_calls: [{ id: "call_1", function: { name, arguments: JSON.stringify(args) } }],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 40, completion_tokens: 20 },
  });

const today = () => new Date().toISOString().slice(0, 10);

describe("AI plan changes", () => {
  it("stores a proposal without writing, then applies and reverts it", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "plan");
    await addProvider(app, auth);
    const conversation = await newConversation(app, auth);

    stub = installFetch(() =>
      toolCompletion("create_workout", {
        date: today(),
        kind: "recovery",
        title: "جلسهٔ سبک ریکاوری",
        intensity: "low",
        estimatedMinutes: 30,
        exercises: [{ name: "دوچرخه ثابت", sets: 1, reps: "۲۰ دقیقه" }],
      }),
    );

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "امروز خسته‌ام؛ یک جلسه سبک بگذار" })
      .expect(201);

    expect(res.body.data.planChange).toBeTruthy();
    expect(res.body.data.planChange.status).toBe("pending");
    expect(res.body.data.planChange.operations).toHaveLength(1);
    expect(res.body.data.planChange.operations[0].kind).toBe("workout.create");

    // A proposal writes no plan row and no workout.
    expect(await prisma.workout.count()).toBe(0);

    const applied = await request(app)
      .post(`/api/plan-changes/${res.body.data.planChange.id}/apply`)
      .set("Cookie", auth)
      .expect(200);
    expect(applied.body.data.status).toBe("applied");
    expect(await prisma.workout.count()).toBe(1);
    const workout = await prisma.workout.findFirstOrThrow({ include: { exercises: true } });
    expect(workout.title).toBe("جلسهٔ سبک ریکاوری");
    expect(workout.exercises).toHaveLength(1);

    // Applying twice does not duplicate the write.
    await request(app)
      .post(`/api/plan-changes/${res.body.data.planChange.id}/apply`)
      .set("Cookie", auth)
      .expect(200);
    expect(await prisma.workout.count()).toBe(1);

    const reverted = await request(app)
      .post(`/api/plan-changes/${res.body.data.planChange.id}/revert`)
      .set("Cookie", auth)
      .expect(200);
    expect(reverted.body.data.status).toBe("reverted");
    expect(await prisma.workout.count()).toBe(0);
  });

  it("rejects a proposal without touching the plan", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "reject");
    await addProvider(app, auth);
    const conversation = await newConversation(app, auth, "nutritionist");

    stub = installFetch(() =>
      toolCompletion("update_nutrition_targets", {
        kcal: 2400,
        proteinG: 150,
        carbsG: 280,
        fatG: 70,
        summary: "افزایش پروتئین روزانه",
      }),
    );

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "پروتئین را بیشتر کن" })
      .expect(201);
    expect(res.body.data.planChange.summary).toContain("پروتئین");
    expect(await prisma.nutritionTarget.count()).toBe(0);

    const rejected = await request(app)
      .post(`/api/plan-changes/${res.body.data.planChange.id}/reject`)
      .set("Cookie", auth)
      .expect(200);
    expect(rejected.body.data.status).toBe("rejected");
    expect(await prisma.nutritionTarget.count()).toBe(0);
  });

  it("refuses a delete that would erase recorded training history", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "history");
    await addProvider(app, auth);
    const conversation = await newConversation(app, auth);

    const created = await request(app)
      .post("/api/training/workouts")
      .set("Cookie", auth)
      .send({
        date: today(),
        kind: "strength",
        title: "جلسهٔ قدرتی",
        intensity: "moderate",
        exercises: [{ name: "اسکات", sets: 3, reps: "8" }],
      })
      .expect(201);
    const workoutId = created.body.data.id as string;
    const exerciseId = created.body.data.exercises[0].id as string;
    await request(app)
      .post(`/api/training/workouts/${workoutId}/sessions`)
      .set("Cookie", auth)
      .send({
        durationMinutes: 45,
        performances: [{ exerciseId, setIndex: 1, reps: 8, weightKg: 80 }],
      })
      .expect(201);

    stub = installFetch(() => toolCompletion("delete_workout", { workoutId }));

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "این تمرین را حذف کن" })
      .expect(409);
    expect(res.body.error.code).toBe("workout_has_history");
    expect(await prisma.workout.count()).toBe(1);
    expect(await prisma.planChange.count()).toBe(0);
  });

  it("keeps one user's change unreadable and unappliable by another", async () => {
    const app = createApp();
    const a = await signIn(app, "iso-a");
    const b = await signIn(app, "iso-b");
    await addProvider(app, a.auth);
    await addProvider(app, b.auth);
    const conversation = await newConversation(app, a.auth);

    stub = installFetch(() =>
      toolCompletion("create_workout", {
        date: today(),
        kind: "cardio",
        title: "دویدن",
        estimatedMinutes: 25,
      }),
    );

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", a.auth)
      .send({ content: "دویدن اضافه کن" })
      .expect(201);
    const changeId = res.body.data.planChange.id as string;

    await request(app).get(`/api/plan-changes/${changeId}`).set("Cookie", b.auth).expect(404);
    await request(app).post(`/api/plan-changes/${changeId}/apply`).set("Cookie", b.auth).expect(404);
    expect(await prisma.workout.count()).toBe(0);
  });
});

describe("food analysis", () => {
  const answer = {
    name: "صبحانه",
    items: [
      { name: "نان سنگک", amount: 80, unit: "g", kcal: 200, proteinG: 7, carbsG: 40, fatG: 1 },
      { name: "پنیر", amount: 30, unit: "g", kcal: 80, proteinG: 5, carbsG: 1, fatG: 6 },
    ],
    confidence: 0.72,
    portionNotes: "یک کف دست نان و یک برش پنیر",
    ingredients: ["گندم", "شیر"],
    explanation: "تخمین بر اساس اقلام توصیف‌شده.",
    uncertainty: ["مقدار پنیر ممکن است بیشتر باشد."],
  };

  it("returns a validated estimate and stores nothing", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "food");
    await addProvider(app, auth);

    stub = installFetch(() =>
      jsonResponse({
        model: "gpt-4o-mini",
        choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 80, completion_tokens: 90 },
      }),
    );

    const res = await request(app)
      .post("/api/nutrition/analyze")
      .set("Cookie", auth)
      .send({ text: "نان سنگک و پنیر خوردم" })
      .expect(200);

    expect(res.body.data.totals).toEqual({ kcal: 280, proteinG: 12, carbsG: 41, fatG: 7 });
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.confidence).toBe(0.72);
    expect(res.body.data.source).toBe("ai_text");
    expect(await prisma.meal.count()).toBe(0);
  });

  it("reports unreadable model output instead of inventing numbers", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "food-bad");
    await addProvider(app, auth);

    stub = installFetch(() =>
      jsonResponse({
        model: "gpt-4o-mini",
        choices: [{ message: { content: "قطعاً ۵۰۰ کالری است." }, finish_reason: "stop" }],
        usage: {},
      }),
    );

    const res = await request(app)
      .post("/api/nutrition/analyze")
      .set("Cookie", auth)
      .send({ text: "چیزی خوردم" })
      .expect(502);
    expect(res.body.error.code).toBe("ai_invalid_response");
  });

  it("refuses an image on a text-only model without calling the provider", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "food-vision");
    const provider = await addProvider(app, auth);
    const user = await prisma.user.findFirstOrThrow();
    await prisma.aiModelConfig.create({
      data: {
        providerConfigId: provider,
        userId: user.id,
        modelId: "text-only-chef",
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: true,
      },
    });

    stub = installFetch(() => jsonResponse({ choices: [{ message: { content: "{}" } }] }));

    const res = await request(app)
      .post("/api/nutrition/analyze")
      .set("Cookie", auth)
      .send({
        image: "data:image/png;base64,iVBORw0KGgo=",
        modelId: "text-only-chef",
      })
      .expect(422);
    expect(res.body.error.code).toBe("vision_not_supported");
    expect(stub.calls).toHaveLength(0);
  });
});
