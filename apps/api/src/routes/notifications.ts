import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { NOTIFICATION_TYPE } from "../domain.js";
import { AppError, ok, parseBody, uid } from "../http.js";

export const notificationRouter = Router();

notificationRouter.get("/", async (req, res) => {
  const userId = uid(req);
  const unreadOnly = req.query.unread === "1";
  const items = await prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  ok(res, {
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.dataJson ? JSON.parse(n.dataJson) : null,
      scheduledAt: n.scheduledAt ? n.scheduledAt.toISOString() : null,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
    types: NOTIFICATION_TYPE,
  });
});

notificationRouter.post("/:id/read", async (req, res) => {
  const userId = uid(req);
  const updated = await prisma.notification.updateMany({
    where: { id: req.params.id, userId },
    data: { readAt: new Date() },
  });
  if (updated.count === 0) throw AppError.notFound("اعلان");
  ok(res, { read: true });
});

/** Creating a reminder is a plain write; delivery is not claimed anywhere. */
notificationRouter.post("/", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(
    z.object({
      type: z.enum(NOTIFICATION_TYPE),
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().max(500).optional(),
      scheduledAt: z.string().datetime({ offset: true }).optional(),
    }),
    req.body,
  );

  const created = await prisma.notification.create({
    data: {
      userId,
      type: body.type,
      title: body.title,
      body: body.body ?? null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    },
  });
  ok(res, { id: created.id, scheduledAt: created.scheduledAt?.toISOString() ?? null }, 201);
});
