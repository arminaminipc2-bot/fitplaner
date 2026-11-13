import { Router } from "express";
import { prisma } from "../db.js";
import { PLAN_CHANGE_STATUS } from "../domain.js";
import { AppError, ok, uid } from "../http.js";
import { applyPlanChange, rejectPlanChange, revertPlanChange } from "../services/plan-executor.js";

export const planChangeRouter = Router();
function serialize(c: {
  id: string;
  source: string;
  summary: string;
  operations: string;
  status: string;
  requiresConfirmation: boolean;
  createdAt: Date;
  appliedAt: Date | null;
  revertedAt: Date | null;
  error: string | null;
  conversationId: string | null;
}) {
  return {
    id: c.id,
    source: c.source,
    summary: c.summary,
    operations: JSON.parse(c.operations) as unknown[],
    status: c.status,
    requiresConfirmation: c.requiresConfirmation,
    conversationId: c.conversationId,
    createdAt: c.createdAt.toISOString(),
    appliedAt: c.appliedAt ? c.appliedAt.toISOString() : null,
    revertedAt: c.revertedAt ? c.revertedAt.toISOString() : null,
    error: c.error,
  };
}

planChangeRouter.get("/", async (req, res) => {
  const userId = uid(req);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const conversationId =
    typeof req.query.conversationId === "string" ? req.query.conversationId : undefined;
  if (status && !PLAN_CHANGE_STATUS.includes(status as never)) {
    throw AppError.validation({ status: "این وضعیت شناخته‌شده نیست." });
  }

  const items = await prisma.planChange.findMany({
    where: {
      userId,
      ...(status ? { status } : {}),
      ...(conversationId ? { conversationId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  ok(res, { items: items.map(serialize), statuses: PLAN_CHANGE_STATUS });
});

planChangeRouter.get("/:id", async (req, res) => {
  const found = await prisma.planChange.findFirst({ where: { id: req.params.id, userId: uid(req) } });
  if (!found) throw AppError.notFound("تغییر برنامه");
  ok(res, serialize(found));
});

/** The user's explicit approval — the only path from a proposal to real rows. */
planChangeRouter.post("/:id/apply", async (req, res) => {
  ok(res, await applyPlanChange(uid(req), req.params.id));
});

planChangeRouter.post("/:id/reject", async (req, res) => {
  ok(res, await rejectPlanChange(uid(req), req.params.id));
});

/** Undo an applied change from its stored before-snapshot. */
planChangeRouter.post("/:id/revert", async (req, res) => {
  ok(res, await revertPlanChange(uid(req), req.params.id));
});
