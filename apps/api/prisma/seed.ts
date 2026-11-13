import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { hashPassword } from "../src/auth/passwords.js";
import { computeEnergyTargets } from "../src/science/energy.js";
import { addDays, tehranDate } from "../src/time.js";

const adapterUrl = process.env.DATABASE_URL?.startsWith("file:")
  ? process.env.DATABASE_URL
  : "file:./dev.db";

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: adapterUrl }) });

const DEMO_EMAIL = "demo@fitplaner.app";
const DEMO_PASSWORD = "demo-1404";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const round1 = (value: number) => Math.round(value * 10) / 10;

const EXERCISES = [
  ["پرس سینه هالتر", "سینه", 4, "۶–۸", 150],
  ["پرس بالا سینه دمبل", "بالا سینه", 3, "۱۰–۱۲", 90],
  ["پرس سرشانه هالتر", "سرشانه", 4, "۸", 120],
  ["نشر از جانب", "سرشانه", 3, "۱۲–۱۵", 60],
  ["پشت بازو سیم‌کش", "پشت بازو", 3, "۱۲", 60],
] as const;

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    await prisma.$transaction([
      prisma.workout.deleteMany({ where: { userId: existing.id } }),
      prisma.meal.deleteMany({ where: { userId: existing.id } }),
      prisma.waterRecord.deleteMany({ where: { userId: existing.id } }),
      prisma.bodyMeasurement.deleteMany({ where: { userId: existing.id } }),
      prisma.progressRecord.deleteMany({ where: { userId: existing.id } }),
      prisma.nutritionTarget.deleteMany({ where: { userId: existing.id } }),
      prisma.aiConversation.deleteMany({ where: { userId: existing.id } }),
      prisma.aiModelConfig.deleteMany({ where: { userId: existing.id } }),
      prisma.aiProviderConfig.deleteMany({ where: { userId: existing.id } }),
      prisma.planChange.deleteMany({ where: { userId: existing.id } }),
      prisma.notification.deleteMany({ where: { userId: existing.id } }),
      prisma.fitnessGoal.deleteMany({ where: { userId: existing.id } }),
    ]);
    console.log("demo account already existed — its training and food rows were reset");
  }

  const user =
    existing ??
    (await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        profile: {
          create: {
            displayName: "کاربر نمونه",
            sex: "male",
            birthDate: new Date("1994-06-22T00:00:00.000Z"),
            heightCm: 178,
            activityLevel: "moderate",
            trainingExperience: "intermediate",
            goal: "lose_fat",
            dietaryRestrictions: "گیاهخواری نه؛ لبنیات کم‌چرب",
            maxWorkoutMinutes: 60,
            trainingDays: JSON.stringify([0, 1, 3, 5]),
            onboardingStep: 6,
            onboardingCompletedAt: new Date(),
          },
        },
      },
    }));

  const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
  // The product day is the Tehran day; using the UTC date would put the demo a
  // day in the past for anyone seeding after 20:30 local time.
  const today = new Date(`${tehranDate()}T00:00:00.000Z`);

  // 28 days of body composition, drifting down with a couple of gaps so the
  // "کمبود داده" states are reachable without faking a perfect history.
  let weight = 84.2;
  for (let i = 27; i >= 0; i -= 1) {
    if (i % 9 === 4) continue;
    weight -= 0.09 + (i % 3) * 0.02;
    await prisma.bodyMeasurement.create({
      data: {
        userId: user.id,
        metric: "weight",
        unit: "kg",
        value: Math.round(weight * 10) / 10,
        takenAt: addDays(today, -i),
        quality: i % 7 === 0 ? "self_reported" : "measured",
      },
    });
    if (i % 7 === 0) {
      await prisma.bodyMeasurement.create({
        data: {
          userId: user.id,
          metric: "bodyFat",
          unit: "percent",
          value: Math.round((19.4 - (27 - i) * 0.03) * 10) / 10,
          takenAt: addDays(today, -i),
          quality: "estimated",
          note: "تخمین با روش محیطی",
        },
      });
    }
  }

  const targets = computeEnergyTargets({
    sex: "male",
    ageYears: 32,
    heightCm: profile.heightCm ?? 178,
    weightKg: weight,
    activityLevel: "moderate",
    goal: "lose_fat",
  });

  await prisma.nutritionTarget.create({
    data: {
      userId: user.id,
      effectiveFrom: addDays(today, -14),
      kcal: targets.kcal,
      proteinG: targets.proteinG,
      carbsG: targets.carbsG,
      fatG: targets.fatG,
      waterMl: targets.waterMl,
      source: "manual",
      notes: targets.warnings.join("، ") || null,
    },
  });

  const program = await prisma.trainingProgram.create({
    data: {
      userId: user.id,
      name: "فاز حجم‌کشی پیش‌فصل",
      description: "چهار جلسه در هفته؛ دو جلسه قدرت، یک اینتروال، یک تمرین با توپ.",
      startDate: addDays(today, -28),
      endDate: addDays(today, 28),
      daysPerWeek: 4,
      focus: "قدرت + هوازی",
      source: "manual",
    },
  });

  // Four consecutive weeks anchored to the Iranian Saturday: two behind the
  // user, the current one partly done, and one still ahead — so the plan page
  // has both history and something to look forward to.
  const saturdayOfCurrentWeek = addDays(today, -((today.getUTCDay() + 1) % 7));
  /** The current week's Tuesday session, used by the pending AI proposal below. */
  let coachTarget: { id: string; version: number } | null = null;
  for (let week = -2; week <= 1; week += 1) {
    for (const [offset, kind, title, minutes, intensity] of [
      [0, "strength", "بالاتنه فشاری", 55, "high"],
      [1, "cardio", "دویدن اینتروال", 35, "high"],
      [3, "football", "تمرین فوتبال با توپ", 70, "moderate"],
      [5, "strength", "پایین‌تنه", 50, "moderate"],
    ] as const) {
      const date = addDays(saturdayOfCurrentWeek, week * 7 + offset);
      const past = date < today;
      const created = await prisma.workout.create({
        data: {
          userId: user.id,
          programId: program.id,
          date,
          kind,
          title,
          intensity,
          estimatedMinutes: minutes,
          status: past ? (week === 0 && offset === 1 ? "missed" : "completed") : "scheduled",
          completedAt: past ? date : null,
        },
      });

      if (week === 0 && offset === 3) {
        coachTarget = { id: created.id, version: created.version };
      }

      const list = kind === "strength" ? EXERCISES : kind === "football" ? EXERCISES.slice(0, 2) : [];
      for (const [i, [name, muscle, sets, reps, rest]] of list.entries()) {
        await prisma.exercise.create({
          data: {
            workoutId: created.id,
            userId: user.id,
            name,
            muscleGroup: muscle,
            sets,
            reps,
            restSeconds: rest,
            orderIndex: i,
          },
        });
      }
    }
  }

  // Meals for the last ten days: three slots a day, one of them an AI estimate
  // that stays marked as such. Every meal is anchored on a protein source plus
  // one or two sides, with portions that rotate day to day.
  /** Per 100 g: kcal, protein, carbs, fat. */
  const FOODS: Record<string, [number, number, number, number]> = {
    "سینه مرغ گریل‌شده": [165, 31, 0, 4],
    "تخم‌مرغ آب‌پز": [155, 13, 1.1, 11],
    "عدس پخته": [116, 9, 20, 0.4],
    "ماست کم‌چرب": [60, 4.5, 4.5, 1.5],
    "برنج قهوه‌ای پخته": [120, 2.7, 25, 1],
    "نان سنگک": [250, 8, 47, 1.5],
    "سیب": [52, 0.3, 14, 0.1],
    "روغن زیتون": [884, 0, 0, 100],
  };
  // Chicken in half the meals: 163 g of protein is unreachable from rice and
  // bread, and a demo that misses its own target every day reads as a bug.
  const PROTEINS = [
    "سینه مرغ گریل‌شده",
    "تخم‌مرغ آب‌پز",
    "سینه مرغ گریل‌شده",
    "عدس پخته",
    "ماست کم‌چرب",
    "سینه مرغ گریل‌شده",
  ];
  // Each food carries the portion sizes a person actually eats, so a gram
  // figure here stays believable next to its calorie count.
  const SIDES: [string, number[]][] = [
    ["برنج قهوه‌ای پخته", [170, 210, 250]],
    ["نان سنگک", [60, 80, 100]],
    ["سیب", [100, 150]],
    ["روغن زیتون", [10, 15, 20]],
  ];
  const PROTEIN_PORTIONS = [160, 240, 190, 220, 170];
  // A heavy day and a light day: flat adherence charts hide the trend the
  // progress page exists to show.
  const DAY_FACTOR: Record<number, number> = { 6: 1.25, 2: 0.85 };
  const daySlots: { slot: "breakfast" | "lunch" | "dinner"; name: string }[] = [
    { slot: "breakfast", name: "صبحانه" },
    { slot: "lunch", name: "ناهار" },
    { slot: "dinner", name: "شام" },
  ];

  function foodRow(name: string, grams: number, dayFactor: number) {
    const amount = Math.round((grams * dayFactor) / 5) * 5;
    const per100 = FOODS[name];
    const factor = amount / 100;
    return {
      name,
      amount,
      kcal: Math.round(per100[0] * factor),
      proteinG: round1(per100[1] * factor),
      carbsG: round1(per100[2] * factor),
      fatG: round1(per100[3] * factor),
    };
  }

  for (let i = 9; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    const dayFactor = DAY_FACTOR[i] ?? 1;
    for (const [slotIdx, { slot, name }] of daySlots.entries()) {
      const aiMeal = i === 3 && slot === "lunch";
      const sideCount = slot === "lunch" ? 3 : 2;
      const items = [
        foodRow(
          PROTEINS[(i * 3 + slotIdx) % PROTEINS.length],
          PROTEIN_PORTIONS[(i + slotIdx) % PROTEIN_PORTIONS.length],
          dayFactor,
        ),
        ...Array.from({ length: sideCount }, (_, k) => {
          const [side, portions] = SIDES[(i * 2 + slotIdx + k * 3) % SIDES.length];
          return foodRow(side, portions[(i + slotIdx + k) % portions.length], dayFactor);
        }),
      ];

      const meal = await prisma.meal.create({
        data: {
          userId: user.id,
          date,
          slot,
          name,
          source: aiMeal ? "ai_photo" : "manual",
          confidence: aiMeal ? 0.62 : null,
          kcal: sum(items.map((item) => item.kcal)),
          proteinG: round1(sum(items.map((item) => item.proteinG))),
          carbsG: round1(sum(items.map((item) => item.carbsG))),
          fatG: round1(sum(items.map((item) => item.fatG))),
        },
      });
      for (const item of items) {
        await prisma.foodItem.create({
          data: {
            mealId: meal.id,
            userId: user.id,
            name: item.name,
            amount: item.amount,
            unit: "g",
            kcal: item.kcal,
            proteinG: item.proteinG,
            carbsG: item.carbsG,
            fatG: item.fatG,
            source: aiMeal ? "ai_photo" : "manual",
            confidence: aiMeal ? 0.62 : null,
          },
        });
      }
    }
    for (let glass = 0; glass < 8 + (i % 4); glass += 1) {
      await prisma.waterRecord.create({
        data: { userId: user.id, amountMl: 250, timestamp: new Date(date.getTime() + (8 + glass * 2) * 3_600_000) },
      });
    }
  }

  const conversation = await prisma.aiConversation.create({
    data: {
      userId: user.id,
      assistant: "coach",
      title: "تنظیم هفته مسابقه",
      lastMessageAt: addDays(today, -2),
    },
  });
  await prisma.aiMessage.createMany({
    data: [
      {
        conversationId: conversation.id,
        userId: user.id,
        role: "user",
        content: "این هفته خیلی خسته‌ام و پنج‌شنبه مسابقه دارم. برنامه را سبک‌تر کن.",
        createdAt: addDays(today, -2),
      },
      {
        conversationId: conversation.id,
        userId: user.id,
        role: "assistant",
        content:
          "جلسه سه‌شنبه را از تمرین با توپ به ریکاوری تغییر می‌دهم تا پیش از مسابقه پنج‌شنبه بدنت تازه بماند. این تغییر را تا وقتی تأیید نکنی روی برنامه اعمال نمی‌کنم.",
        createdAt: addDays(today, -2),
      },
    ],
  });
  // A proposal must use the same validated operation shape the executor can
  // apply; the old `{ op, target, set }` stub could be displayed but never applied.
  if (coachTarget) {
    await prisma.planChange.create({
      data: {
        userId: user.id,
        conversationId: conversation.id,
        source: "ai",
        summary: "تغییر جلسه سه‌شنبه از تمرین با توپ به ریکاوری",
        operations: JSON.stringify([
          {
            kind: "workout.update",
            id: coachTarget.id,
            expectedVersion: coachTarget.version,
            patch: { kind: "recovery", title: "ریکاوری پیش از مسابقه", estimatedMinutes: 25 },
          },
        ]),
        status: "pending",
        createdAt: addDays(today, -2),
      },
    });
  }

  await prisma.fitnessGoal.create({
    data: { userId: user.id, type: "lose_fat", targetValue: 78, unit: "kg", targetDate: addDays(today, 60), status: "active" },
  });

  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "data_gap",
      title: "چند روز وزن ثبت نشده است",
      body: "برای روند دقیق‌تر، هفته‌ای دو بار وزن را ثبت کنید.",
    },
  });

  const provider = await prisma.aiProviderConfig.create({
    data: {
      userId: user.id,
      provider: "custom",
      label: "هوش مصنوعی فیت‌پلنر",
      baseUrl: "http://127.0.0.1:8787/api/mock-ai/v1",
      enabled: true,
      isDefault: true,
    },
  });

  await prisma.aiModelConfig.create({
    data: {
      providerConfigId: provider.id,
      userId: user.id,
      modelId: "fitplaner-ai",
      displayName: "موتور هوشمند فیت‌پلنر",
      supportsVision: true,
      supportsTools: true,
      supportsStreaming: true,
      reasoning: "medium",
      enabled: true,
    },
  });

  const counts = {
    workouts: await prisma.workout.count({ where: { userId: user.id } }),
    meals: await prisma.meal.count({ where: { userId: user.id } }),
    measurements: await prisma.bodyMeasurement.count({ where: { userId: user.id } }),
  };
  console.log(
    `seeded ${DEMO_EMAIL} / ${DEMO_PASSWORD} — ${counts.workouts} workouts, ${counts.meals} meals, ${counts.measurements} measurements`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
