import { prisma } from "../db.js";
import { AppError } from "../http.js";
import { requestReply, requestStreamingReply, type AssistantKind, type AttachmentRef } from "./assistant.js";
import { executeReadTool, isReadTool, isWriteTool } from "./ai/tools.js";
import {
  createPlanChange,
  operationsFromToolCall,
  type Operation,
  type ProposedChange,
} from "./plan-executor.js";
import type { Reasoning, StreamEvent, ToolCall } from "./ai/types.js";

/**
 * One code path for both chat routes: store the user's turn, ask the model, then
 * store either the answer or the failure. Nothing is invented at any step, and
 * both routes report the same `fields.userMessageId` / `fields.failedMessageId`
 * contract the client already depends on.
 */

/** Longest cut-off stream fragment kept in the transcript. */
const MAX_PERSISTED_PARTIAL = 20_000;

export type StoredMessage = {
  id: string;
  role: string;
  content: string;
  at: string;
  modelId: string | null;
  providerId: string | null;
  attachments: unknown;
  toolCalls: ToolCall[] | null;
  finishReason: string | null;
  error: string | null;
};

type MessageRow = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  modelId: string | null;
  providerId: string | null;
  attachments: string | null;
  error: string | null;
};

/**
 * Assistant rows carry their provider metadata in `attachments` (the schema has
 * no tool or finish column): an array is the user's own refs, an object is what
 * the model returned — tool calls surfaced as data, never executed here.
 */
export function serializeMessage(m: MessageRow): StoredMessage {
  let parsed: unknown = null;
  if (m.attachments) {
    try {
      parsed = JSON.parse(m.attachments);
    } catch {
      parsed = null;
    }
  }

  const meta =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { toolCalls?: unknown; finishReason?: unknown })
      : null;

  return {
    id: m.id,
    role: m.role,
    content: m.content,
    at: m.createdAt.toISOString(),
    modelId: m.modelId,
    providerId: m.providerId,
    attachments: Array.isArray(parsed) ? parsed : null,
    toolCalls: Array.isArray(meta?.toolCalls) ? (meta!.toolCalls as ToolCall[]) : null,
    finishReason: typeof meta?.finishReason === "string" ? meta.finishReason : null,
    error: m.error,
  };
}

export async function ownedConversation(userId: string, id: string) {
  const found = await prisma.aiConversation.findFirst({ where: { id, userId } });
  if (!found) throw AppError.notFound("گفت‌وگو");
  return found;
}

export type TurnRequest = {
  userId: string;
  conversationId: string;
  content: string;
  attachments?: AttachmentRef[];
  providerConfigId?: string;
  modelId?: string;
  reasoning?: Reasoning;
  requireStreaming?: boolean;
  requireTools?: boolean;
  /** Offer tools to a model that supports them (default true for chat). */
  enableTools?: boolean;
  /**
   * Execute tool calls. False keeps the older contract where a caller asked for
   * tools explicitly and wants them surfaced as data only.
   */
  executeTools?: boolean;
  signal?: AbortSignal;
  onEvent?: (event: StreamEvent) => void | Promise<void>;
};

/** Beyond this the model is reading instead of answering. */
const MAX_TOOL_ROUNDS = 2;
const MAX_OPERATIONS = 12;

/**
 * The user turn is stored first, then the model is asked. If the provider is
 * missing or fails, the user message stays (it is real history) and the reply
 * slot records the failure — the transcript never shows a fabricated answer.
 */
export async function runTurn(
  request: TurnRequest,
): Promise<{ userMessage: StoredMessage; reply: StoredMessage; planChange: ProposedChange | null }> {
  const conversation = await ownedConversation(request.userId, request.conversationId);
  const assistant = conversation.assistant as AssistantKind;

  const userMessage = await prisma.aiMessage.create({
    data: {
      conversationId: conversation.id,
      userId: request.userId,
      role: "user",
      content: request.content,
      attachments: request.attachments?.length ? JSON.stringify(request.attachments) : null,
    },
  });
  await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  // Deltas are mirrored here so an interrupted stream can be stored as the
  // unfinished answer it actually was.
  let streamedText = "";
  const onEvent = request.onEvent
    ? async (event: StreamEvent) => {
        if (event.type === "delta") streamedText += event.text;
        await request.onEvent?.(event);
      }
    : undefined;

  const options = {
    conversationId: conversation.id,
    ...(request.providerConfigId ? { providerConfigId: request.providerConfigId } : {}),
    ...(request.modelId ? { modelId: request.modelId } : {}),
    ...(request.reasoning ? { reasoning: request.reasoning } : {}),
    ...(request.attachments ? { attachments: request.attachments } : {}),
    requireTools: request.requireTools,
    requireStreaming: request.requireStreaming,
    onEvent,
    signal: request.signal,
  };

  try {
    const ask = (extraToolResults?: string) => {
      const askOptions = {
        ...options,
        enableTools: true,
        ...(extraToolResults ? { extraToolResults } : {}),
      };
      return onEvent
        ? requestStreamingReply(request.userId, assistant, askOptions)
        : requestReply(request.userId, assistant, askOptions);
    };

    let reply = await ask();
    const readResults: { tool: string; result: unknown }[] = [];
    const proposed: { summary: string; operations: Operation[] }[] = [];
    const allCalls: ToolCall[] = [];

    /**
     * One tool round. Reads run and are fed back to the model; writes are only
     * validated into operations — they do not touch a plan row here.
     */
    const handleToolCalls = async (calls: ToolCall[]): Promise<boolean> => {
      let sawRead = false;
      for (const call of calls) {
        allCalls.push(call);
        if (isWriteTool(call.name)) {
          const change = await operationsFromToolCall(request.userId, assistant, call);
          if (change) proposed.push(change);
          continue;
        }
        // A hallucinated tool name is surfaced as data, never executed and never
        // turned into a silent failure of an otherwise useful answer.
        if (!isReadTool(call.name)) continue;

        sawRead = true;
        const result = await executeReadTool(request.userId, call);
        readResults.push({ tool: call.name, result });
        await prisma.aiToolExecutionLog.create({
          data: {
            userId: request.userId,
            conversationId: conversation.id,
            tool: call.name,
            argsJson: call.argumentsJson.slice(0, 20_000),
            resultJson: JSON.stringify(result).slice(0, 60_000),
            status: "applied",
            appliedAt: new Date(),
          },
        });
      }
      return sawRead;
    };

    // Explicit `requireTools` callers keep the Phase-5 contract: calls are
    // surfaced as data. The chat screen (no flag) gets real execution.
    let wantsAnotherRound = false;
    if (request.executeTools === false) allCalls.push(...reply.toolCalls);
    else wantsAnotherRound = await handleToolCalls(reply.toolCalls);
    let rounds = 0;
    while (wantsAnotherRound && rounds < MAX_TOOL_ROUNDS) {
      rounds += 1;
      const payload = JSON.stringify(
        readResults.slice(-8).map((r) => ({ tool: r.tool, result: r.result })),
      ).slice(0, 40_000);
      if (onEvent) {
        await onEvent({
          type: "notice",
          code: "tools_reading",
          message: "دستیار در حال خواندن برنامهٔ فعلی است…",
        });
      }
      reply = await ask(payload);
      wantsAnotherRound = await handleToolCalls(reply.toolCalls);
    }

    let planChange: ProposedChange | null = null;
    if (proposed.length > 0) {
      const operations = proposed.flatMap((p) => p.operations);
      if (operations.length > MAX_OPERATIONS) {
        throw new AppError(
          422,
          "plan_change_too_large",
          "این پیشنهاد بیش از حد بزرگ است. آن را به چند تغییر کوچک‌تر تقسیم کنید.",
        );
      }
      const summary = proposed.map((p) => p.summary).join("؛ ").slice(0, 400);
      planChange = await createPlanChange(request.userId, {
        conversationId: conversation.id,
        summary,
        operations,
      });

      for (const call of allCalls.filter((c) => isWriteTool(c.name))) {
        await prisma.aiToolExecutionLog.create({
          data: {
            userId: request.userId,
            conversationId: conversation.id,
            tool: call.name,
            argsJson: call.argumentsJson.slice(0, 20_000),
            status: "pending",
            planChangeId: planChange.id,
          },
        });
      }
    }

    const stored = await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        userId: request.userId,
        role: "assistant",
        content: reply.content,
        providerId: reply.providerId,
        modelId: reply.modelId,
        tokensIn: reply.tokensIn,
        tokensOut: reply.tokensOut,
        attachments: JSON.stringify({
          finishReason: reply.finishReason,
          ...(allCalls.length ? { toolCalls: allCalls } : {}),
          ...(planChange ? { planChangeId: planChange.id } : {}),
        }),
      },
    });

    return {
      userMessage: serializeMessage(userMessage),
      reply: serializeMessage(stored),
      planChange,
    };
  } catch (error) {
    const failure = error instanceof AppError ? error : null;
    const partial = failure?.code === "ai_cancelled" || failure?.code === "ai_stream_interrupted";
    const stored = await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        userId: request.userId,
        role: "assistant",
        // What arrived before the cut, marked with the failure code so the UI can
        // say "unfinished" instead of presenting it as a complete answer.
        content: partial ? streamedText.slice(0, MAX_PERSISTED_PARTIAL) : "",
        providerId: null,
        modelId: null,
        error: failure?.code ?? "ai_request_failed",
      },
    });

    throw new AppError(
      failure?.status ?? 502,
      failure?.code ?? "ai_request_failed",
      failure?.message ?? "پاسخ هوش مصنوعی دریافت نشد.",
      { userMessageId: userMessage.id, failedMessageId: stored.id },
    );
  }
}
