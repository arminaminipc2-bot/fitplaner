import express from "express";
import { env } from "./env.js";
import { prisma } from "./db.js";
import { errorHandler, requireUser } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { measurementRouter } from "./routes/measurements.js";
import { trainingRouter } from "./routes/training.js";
import { nutritionRouter } from "./routes/nutrition.js";
import { progressRouter } from "./routes/progress.js";
import { homeRouter } from "./routes/home.js";
import { chatRouter } from "./routes/chat.js";
import { providerRouter } from "./routes/providers.js";
import { planChangeRouter } from "./routes/plan-changes.js";
import { notificationRouter } from "./routes/notifications.js";
import { mockAiRouter } from "./services/ai/mock-ai.js";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", async (_req, res) => {
    let db = "ok";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "unreachable";
    }
    res.json({
      ok: true,
      service: "fitplaner-api",
      db,
      env: env.NODE_ENV,
      uptimeSec: Math.round(process.uptime()),
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/mock-ai/v1", mockAiRouter);

  // Everything below is per-user: one guard, and every query then filters by
  // the session's userId, so one account can never read another's rows.
  app.use("/api", requireUser);
  app.use("/api/home", homeRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/measurements", measurementRouter);
  app.use("/api/training", trainingRouter);
  app.use("/api/nutrition", nutritionRouter);
  app.use("/api/progress", progressRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/ai/providers", providerRouter);
  app.use("/api/plan-changes", planChangeRouter);
  app.use("/api/notifications", notificationRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ ok: false, error: { code: "unknown_endpoint", message: "این مسیر وجود ندارد." } });
  });

  app.use(errorHandler);
  return app;
}
