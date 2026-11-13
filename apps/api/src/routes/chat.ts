import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ASSISTANT, REASONING, zAssistant } from "../domain.js";
import { AppError, ok, parseBody, uid } from "../http.js";
import { ownedConversation, runTurn, serializeMessage } from "../services/chat-turn.js";
import type { StreamEvent } from "../services/ai/types.js";

export const chatRouter = Router();

chatRouter.get("/conversations", async (req, res) => {
  const items = await prisma.aiConversation.findMany({
    where: { userId: uid(req) },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
  });
  ok(res, {
    items: items.map((c) => ({
      id: c.id,
      assistant: c.assistant,
      title: c.title,
      lastMessageAt: c.lastMessageAt.toISOString(),
    })),
    assistants: ASSISTANT,
  });
});

chatRouter.post("/conversations", async (req, res) => {
  const userId = uid(req);
  const body = parseBody(
    z.object({ assistant: zAssistant, title: z.string().trim().max(80).optional() }),
    req.body,
  );
  const created = await prisma.aiConversation.create({
    data: { userId, assistant: body.assistant, title: body.title ?? null },
  });
  ok(res, { id: created.id, assistant: created.assistant }, 201);
});

chatRouter.get("/conversations/:id", async (req, res) => {
  const userId = uid(req);
  const conversation = await ownedConversation(userId, req.params.id);
  const messages = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  ok(res, {
    conversation: {
      id: conversation.id,
      assistant: conversation.assistant,
      title: conversation.title,
    },
    messages: messages.map(serializeMessage),
  });
});

chatRouter.patch("/conversations/:id", async (req, res) => {
  const userId = uid(req);
  const conversation = await ownedConversation(userId, req.params.id);
  const body = parseBody(z.object({ title: z.string().trim().min(1).max(80) }), req.body);
  const updated = await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: { title: body.title },
  });
  ok(res, { id: updated.id, title: updated.title });
});

chatRouter.delete("/conversations/:id", async (req, res) => {
  const userId = uid(req);
  const deleted = await prisma.aiConversation.deleteMany({ where: { id: req.params.id, userId } });
  if (deleted.count === 0) throw AppError.notFound("گفت‌وگو");
  ok(res, { deleted: true });
});

/**
 * A base64 image can be long; an http(s) link is short. Both are accepted, and
 * the server only ever reads them if the selected model reports vision.
 */
const attachmentSchema = z.object({
  kind: z.enum(["image", "file"]),
  ref: z.string().min(1).max(900_000),
});

const messageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  attachments: z.array(attachmentSchema).max(4).optional(),
  /** Which AiProviderConfig row to ask; defaults to the enabled default row. */
  providerConfigId: z.string().min(8).max(64).optional(),
  /** An AiModelConfig id from GET /api/ai/providers/:id/models. */
  modelId: z.string().min(1).max(120).optional(),
  reasoning: z.enum(REASONING).optional(),
  /**
   * Phase 6 opt-in: ask for an answer that may carry tool calls. A model without
   * tool support is refused rather than quietly downgraded.
   */
  requireTools: z.boolean().optional(),
  /** Insist on a stream: a model without one is refused (422) instead of downgraded. */
  requireStreaming: z.boolean().optional(),
});

/**
 * The user's turn is stored first, then the model is asked. If the provider is
 * missing or fails, the user message stays (it is real history) and the reply
 * slot records the failure — the transcript never shows a fabricated answer.
 */
chatRouter.post("/conversations/:id/messages", async (req, res) => {
  const userId = uid(req);
  const conversation = await ownedConversation(userId, req.params.id);
  const body = parseBody(messageSchema, req.body);

  const result = await runTurn({
    userId,
    conversationId: conversation.id,
    content: body.content,
    ...(body.attachments ? { attachments: body.attachments } : {}),
    ...(body.providerConfigId ? { providerConfigId: body.providerConfigId } : {}),
    ...(body.modelId ? { modelId: body.modelId } : {}),
    ...(body.reasoning ? { reasoning: body.reasoning } : {}),
    ...(body.requireTools !== undefined ? { requireTools: body.requireTools } : {}),
    ...(body.requireStreaming !== undefined ? { requireStreaming: body.requireStreaming } : {}),
    executeTools: body.requireTools !== true,
  });

  ok(res, { userMessage: result.userMessage, reply: result.reply, planChange: result.planChange }, 201);
});

// ---------- streaming ----------

type Write = (event: string, data: unknown) => void;

/** Server-Sent Events, one JSON payload per frame. */
function sseWriter(res: Response): { write: Write; close: () => void; closed: () => boolean } {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const closed = () => res.writableEnded || res.destroyed;
  const write: Write = (event, data) => {
    if (closed()) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  return {
    write,
    closed,
    close: () => {
      if (!closed()) res.end();
    },
  };
}

/**
 * The same turn, streamed. Deltas arrive as `delta` frames; persistence happens
 * once, in the shared path, and the final `done` frame carries exactly the
 * message object the JSON route would have returned.
 */
chatRouter.post("/conversations/:id/messages/stream", async (req, res) => {
  const userId = uid(req);
  const conversation = await ownedConversation(userId, req.params.id);
  const body = parseBody(messageSchema, req.body);
  const sse = sseWriter(res);

  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.on("close", onClose);

  // Comment frames keep a proxy from buffering a quiet connection.
  const heartbeat = setInterval(() => {
    if (!sse.closed()) res.write(": ping\n\n");
  }, 15_000);

  const onEvent = async (event: StreamEvent) => {
    if (event.type === "delta") sse.write("delta", { text: event.text });
    else if (event.type === "tool") sse.write("tool", event.call);
    else if (event.type === "notice") sse.write("notice", { code: event.code, message: event.message });
  };

  try {
    sse.write("start", {
      conversationId: conversation.id,
      assistant: conversation.assistant,
    });

    const result = await runTurn({
      userId,
      conversationId: conversation.id,
      content: body.content,
      ...(body.attachments ? { attachments: body.attachments } : {}),
      ...(body.providerConfigId ? { providerConfigId: body.providerConfigId } : {}),
      ...(body.modelId ? { modelId: body.modelId } : {}),
      ...(body.reasoning ? { reasoning: body.reasoning } : {}),
      ...(body.requireTools !== undefined ? { requireTools: body.requireTools } : {}),
      ...(body.requireStreaming !== undefined ? { requireStreaming: body.requireStreaming } : {}),
      executeTools: body.requireTools !== true,
      signal: controller.signal,
      onEvent,
    });

    sse.write("done", {
      userMessage: result.userMessage,
      reply: result.reply,
      planChange: result.planChange,
    });
  } catch (error) {
    const failure = error instanceof AppError ? error : null;
    sse.write("error", {
      code: failure?.code ?? "ai_request_failed",
      message: failure?.message ?? "پاسخ هوش مصنوعی دریافت نشد.",
      fields: failure?.fields ?? {},
    });
  } finally {
    clearInterval(heartbeat);
    req.off("close", onClose);
    sse.close();
  }
});
