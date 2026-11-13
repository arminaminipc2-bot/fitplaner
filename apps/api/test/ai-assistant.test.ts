import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { clearDb, cookie, newEmail } from "./helpers.js";
import {
  abortingSseResponse,
  installFetch,
  jsonResponse,
  openaiChunk,
  sseResponse,
  textResponse,
  type FetchStub,
} from "./fake-fetch.js";

/**
 * End-to-end AI behaviour with a stubbed fetch: no provider is ever contacted
 * and no real key exists anywhere in this file.
 */

const KEY_A = "sk-personal-AAAAAAAA1234";
const KEY_B = "sk-personal-BBBBBBBB5678";

let stub: FetchStub;

beforeEach(async () => {
  await clearDb();
  stub?.restore();
});
afterEach(() => stub?.restore());

async function signIn(app: ReturnType<typeof createApp>, tag: string) {
  const email = newEmail(tag);
  const res = await request(app).post("/api/auth/register").send({ email, password: "kashefi-1384" }).expect(201);
  return { auth: cookie(res), email };
}

async function addProvider(app: ReturnType<typeof createApp>, auth: string, apiKey: string, provider = "openai") {
  const res = await request(app)
    .post("/api/ai/providers")
    .set("Cookie", auth)
    .send({ provider, label: "کلید شخصی", apiKey })
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

const chatCompletion = (text: string) =>
  jsonResponse({
    model: "gpt-4o-mini",
    choices: [{ message: { content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 900, completion_tokens: 40 },
  });

describe("asking the assistant", () => {
  it("sends the real transcript plus a Persian system prompt and stores the model's own words", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "reply");
    await addProvider(app, auth, KEY_A);
    const conversation = await newConversation(app, auth, "coach");

    await request(app)
      .patch("/api/profile")
      .set("Cookie", auth)
      .send({ heightCm: 178, sex: "male", birthDate: "1994-06-22T00:00:00.000Z", goal: "lose_fat" })
      .expect(200);
    await request(app)
      .post("/api/measurements")
      .set("Cookie", auth)
      .send({ metric: "weight", value: 86.5, takenAt: "1404-05-20" })
      .expect(201);

    stub = installFetch(() => chatCompletion("حجم را به چهار جلسه می‌رسانم."));

    const first = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "هفتهٔ شلوغی دارم" })
      .expect(201);
    const second = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "پس سه جلسه بگذار" })
      .expect(201);

    expect(first.body.data.reply.content).toBe("حجم را به چهار جلسه می‌رسانم.");
    expect(first.body.data.reply.providerId).toBeTruthy();
    expect(first.body.data.reply.modelId).toBe("gpt-4o-mini");
    expect(second.body.data.reply.finishReason).toBe("stop");

    // Token counts are persisted but never echoed to the browser list view.
    const assistantRows = await prisma.aiMessage.findMany({ where: { conversationId: conversation, role: "assistant" } });
    expect(assistantRows.map((m) => m.tokensIn).sort()).toEqual([900, 900]);

    const call = stub.last();
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call.headers["authorization"]).toBe(`Bearer ${KEY_A}`);
    const body = call.body as { messages: { role: string; content: string }[] };
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("مربی ورزشی");
    expect(body.messages[0].content).toContain("پزشک یا متخصص بالینی نیستی");
    expect(body.messages[0].content).toContain("BMI");
    // Personalised, but not a profile dump: a couple of facts, in Persian digits.
    expect(body.messages[0].content).toContain("۸۶٫۵");
    expect(body.messages[0].content).not.toContain("keyCipher");
    // The earlier turns are part of the history the model sees.
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);

    // Nothing that looks like a secret may come back out.
    const json = JSON.stringify(second.body);
    expect(json).not.toContain(KEY_A);
    expect(json).not.toContain("sk-personal");
    expect(json).not.toContain("keyCipher");

    const detail = await request(app).get(`/api/chat/conversations/${conversation}`).set("Cookie", auth).expect(200);
    expect(detail.body.data.messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);

    const storedConversation = await prisma.aiConversation.findUniqueOrThrow({ where: { id: conversation } });
    const snapshot = JSON.parse(storedConversation.contextJson ?? "{}") as Record<string, unknown>;
    expect(snapshot.weightKg).toBe(86.5);
    expect(snapshot.allowAiPlanEdits).toBe(false);
  });

  it("keeps the nutritionist's own voice and food-only context", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "nutrition");
    await addProvider(app, auth, KEY_A, "gemini");
    const conversation = await newConversation(app, auth, "nutritionist");

    stub = installFetch(() =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "پروتئین را به ۱۴۰ گرم برسان." }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6 },
      }),
    );

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "غذایم کم است؟" })
      .expect(201);

    expect(res.body.data.reply.content).toBe("پروتئین را به ۱۴۰ گرم برسان.");
    const system = (stub.last().body as { systemInstruction: { parts: { text: string }[] } }).systemInstruction.parts[0]
      .text;
    expect(system).toContain("متخصص تغذیه");
    expect(system).not.toContain("مربی ورزشی");
    expect(stub.last().url).toContain("models/gemini-2.5-flash:generateContent");
  });

  it("decrypts only the calling user's key and refuses another account's provider row", async () => {
    const app = createApp();
    const a = await signIn(app, "iso-a");
    const b = await signIn(app, "iso-b");
    const providerA = await addProvider(app, a.auth, KEY_A);
    await addProvider(app, b.auth, KEY_B);
    const conversation = await newConversation(app, a.auth);

    stub = installFetch(() => chatCompletion("باشد"));

    await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", a.auth)
      .send({ content: "سلام" })
      .expect(201);
    expect(stub.last().headers["authorization"]).toBe(`Bearer ${KEY_A}`);

    // B may not borrow A's row — and cannot see that it exists.
    const bConversation = await newConversation(app, b.auth);
    const stolen = await request(app)
      .post(`/api/chat/conversations/${bConversation}/messages`)
      .set("Cookie", b.auth)
      .send({ content: "کلید تو را می‌خواهم", providerConfigId: providerA })
      .expect(404);
    expect(JSON.stringify(stolen.body)).not.toContain(KEY_A);
  });

  it("surfaces a tool call as data instead of writing or pretending", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "tools");
    await addProvider(app, auth, KEY_A);
    const conversation = await newConversation(app, auth);

    stub = installFetch(() =>
      jsonResponse({
        model: "gpt-4o-mini",
        choices: [
          {
            message: {
              content: "یک جلسهٔ دویدن اضافه می‌کنم.",
              tool_calls: [{ id: "call_7", function: { name: "add_workout", arguments: '{"kind":"cardio"}' } }],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 5 },
      }),
    );

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "یک جلسه دویدن اضافه کن" })
      .expect(201);

    expect(res.body.data.reply.toolCalls).toEqual([
      { id: "call_7", name: "add_workout", argumentsJson: '{"kind":"cardio"}' },
    ]);
    // Phase 6 executes; nothing was written here.
    expect(await prisma.aiToolExecutionLog.count()).toBe(0);
    expect(await prisma.workout.count()).toBe(0);
  });

  it("refuses an image for a model without vision, and tools for a model without tools", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "gate");
    const provider = await addProvider(app, auth, KEY_A);
    const conversation = await newConversation(app, auth);

    await prisma.aiModelConfig.create({
      data: {
        providerConfigId: provider,
        userId: (await prisma.user.findFirstOrThrow()).id,
        modelId: "small-text-only",
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: false,
        reasoning: "none",
      },
    });

    stub = installFetch(() => chatCompletion("نباید اصلاً صدا زده شوم"));

    const image = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({
        content: "این عکس را تحلیل کن",
        modelId: "small-text-only",
        attachments: [{ kind: "image", ref: "https://cdn.example/plate.png" }],
      })
      .expect(422);
    expect(image.body.error.code).toBe("vision_not_supported");
    expect(image.body.error.message).toMatch(/[؀-ۿ]/);
    expect(image.body.error.message).not.toContain(KEY_A);

    const tools = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "برنامه را تغییر بده", modelId: "small-text-only", requireTools: true })
      .expect(422);
    expect(tools.body.error.code).toBe("tools_not_supported");

    // Refused before the provider was ever contacted.
    expect(stub.calls.filter((c) => c.url.includes("cdn.example"))).toHaveLength(0);
    expect(stub.calls.filter((c) => c.url.includes("chat/completions"))).toHaveLength(0);

    // The user turn is still real history, marked failed.
    const detail = await request(app).get(`/api/chat/conversations/${conversation}`).set("Cookie", auth).expect(200);
    expect(detail.body.data.messages.map((m: { error: string | null }) => m.error)).toEqual([
      null,
      "vision_not_supported",
      null,
      "tools_not_supported",
    ]);
  });

  it("rejects a model that was never discovered rather than guessing silently", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "unknown-model");
    await addProvider(app, auth, KEY_A);
    const conversation = await newConversation(app, auth);
    stub = installFetch(() => chatCompletion("خبر"));

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "سلام", modelId: "not-in-my-list" })
      .expect(422);
    expect(res.body.error.code).toBe("model_not_available");
    expect(stub.calls).toHaveLength(0);
  });
});

describe("provider failures are reported honestly", () => {
  it("maps a rejected key to a Persian provider_auth_failed and records the failure", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "401");
    await addProvider(app, auth, KEY_A);
    const conversation = await newConversation(app, auth);

    stub = installFetch(() =>
      jsonResponse({ error: { message: `invalid api key: ${KEY_A}` }, type: "error" }, 401),
    );

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "سلام" })
      .expect(502);

    expect(res.body.error.code).toBe("provider_auth_failed");
    expect(res.body.error.message).toContain("کلید API");
    expect(res.body.error.message).not.toContain(KEY_A);
    expect(JSON.stringify(res.body)).not.toContain(KEY_A);
    expect(res.body.error.fields.userMessageId).toMatch(/^c/);
    expect(res.body.error.fields.failedMessageId).toMatch(/^c/);

    const messages = await prisma.aiMessage.findMany({ where: { conversationId: conversation }, orderBy: { createdAt: "asc" } });
    expect(messages.map((m) => [m.role, m.error])).toEqual([
      ["user", null],
      ["assistant", "provider_auth_failed"],
    ]);
  });

  it("distinguishes rate limiting, quota and a provider-side outage", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "statuses");
    await addProvider(app, auth, KEY_A);

    const cases: [number, string, number][] = [
      [429, "ai_rate_limited", 429],
      [402, "provider_quota_exceeded", 502],
      [404, "provider_model_unavailable", 502],
      [500, "provider_unavailable", 503],
      [503, "provider_unavailable", 503],
    ];

    for (const [status, code, expectedStatus] of cases) {
      const conversation = await newConversation(app, auth);
      stub.restore();
      stub = installFetch(() => jsonResponse({ error: { message: "nope" } }, status));
      const res = await request(app)
        .post(`/api/chat/conversations/${conversation}/messages`)
        .set("Cookie", auth)
        .send({ content: "سلام" })
        .expect(expectedStatus);
      expect(res.body.error.code).toBe(code);
      expect(res.body.error.message).toMatch(/[؀-ۿ]/);
      expect(res.body.error.message).not.toContain(KEY_A);
    }
  });

  it("reports an unreachable provider instead of inventing an answer", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "network");
    await addProvider(app, auth, KEY_A);
    const conversation = await newConversation(app, auth);

    stub = installFetch(() => {
      throw new TypeError("fetch failed: ECONNREFUSED 127.0.0.1:443");
    });

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "سلام" })
      .expect(502);
    expect(res.body.error.code).toBe("ai_network_unreachable");
    const row = await prisma.aiMessage.findFirstOrThrow({ where: { conversationId: conversation, role: "assistant" } });
    expect(row.content).toBe("");
    expect(row.error).toBe("ai_network_unreachable");
  });

  it("refuses a body that is not JSON rather than returning nothing at all", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "bad-json");
    await addProvider(app, auth, KEY_A);
    const conversation = await newConversation(app, auth);

    stub = installFetch(() => textResponse("<html>gateway error</html>", 200, "text/html"));
    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "سلام" })
      .expect(502);
    expect(res.body.error.code).toBe("ai_invalid_response");
  });

  it("does not fabricate when the model comes back with no text", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "empty");
    await addProvider(app, auth, KEY_A);
    const conversation = await newConversation(app, auth);

    stub = installFetch(() =>
      jsonResponse({ model: "gpt-4o-mini", choices: [{ message: { content: "" }, finish_reason: "stop" }], usage: {} }),
    );
    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages`)
      .set("Cookie", auth)
      .send({ content: "سلام" })
      .expect(502);
    expect(res.body.error.code).toBe("ai_empty_response");
    const row = await prisma.aiMessage.findFirstOrThrow({ where: { conversationId: conversation, role: "assistant" } });
    expect(row.content).toBe("");
  });

  it("cuts off a provider that never answers", async () => {
    // The helper is exercised directly so the suite does not wait 45 seconds:
    // the same deadline the adapters use, with a deliberately short budget.
    const { fetchBounded, guard } = await import("../src/services/ai/http.js");
    const hanging = () =>
      new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
        headers: { "content-type": "application/json" },
      });
    const local = installFetch(hanging);
    try {
      await expect(
        fetchBounded(
          "https://api.openai.com/v1/chat/completions",
          { method: "POST", body: "{}" },
          guard({ provider: "openai", label: "کلید من", timeoutMs: 120, idleMs: 120 }),
        ),
      ).rejects.toMatchObject({ status: 504, code: "ai_timeout" });
    } finally {
      local.restore();
    }
  });
});

describe("streamed answers", () => {
  const frames = (parts: string[]) =>
    sseResponse([
      ...parts.map((p) => openaiChunk(p)),
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2 } })}\n\n`,
      "data: [DONE]\n\n",
    ]);

  it("delivers deltas and persists exactly one finished assistant message", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "stream");
    await addProvider(app, auth, KEY_A);
    const conversation = await newConversation(app, auth);

    stub = installFetch(() => frames(["سلام. ", "سه جلسه ", "کافی است."]));

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages/stream`)
      .set("Cookie", auth)
      .send({ content: "هفتهٔ شلوغی است" })
      .expect(200);

    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers["cache-control"]).toContain("no-cache");
    expect(res.headers["x-accel-buffering"]).toBe("no");

    const events = parseSse(res.text);
    expect(events.map((e) => e.event)).toEqual(["start", "delta", "delta", "delta", "done"]);
    expect(events.filter((e) => e.event === "delta").map((e) => (e.data as { text: string }).text).join("")).toBe(
      "سلام. سه جلسه کافی است.",
    );

    const done = events.find((e) => e.event === "done")!.data as {
      reply: { content: string; id: string; modelId: string };
      userMessage: { id: string };
    };
    expect(done.reply.content).toBe("سلام. سه جلسه کافی است.");
    expect(done.reply.modelId).toBe("gpt-4o-mini");

    // One assistant row for the whole stream, not one per chunk.
    const rows = await prisma.aiMessage.findMany({ where: { conversationId: conversation } });
    expect(rows).toHaveLength(2);
    const assistant = rows.find((r) => r.role === "assistant")!;
    expect(assistant.content).toBe("سلام. سه جلسه کافی است.");
    expect(assistant.tokensOut).toBe(2);
    expect(assistant.error).toBeNull();
  });

  it("announces a non-streaming model instead of silently downgrading", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "no-stream");
    const provider = await addProvider(app, auth, KEY_A);
    const userId = (await prisma.user.findFirstOrThrow()).id;
    const conversation = await newConversation(app, auth);

    await prisma.aiModelConfig.create({
      data: {
        providerConfigId: provider,
        userId,
        modelId: "text-only-model",
        supportsStreaming: false,
        supportsVision: false,
        supportsTools: false,
      },
    });

    stub = installFetch(() => chatCompletion("پاسخ یک‌باره است."));

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages/stream`)
      .set("Cookie", auth)
      .send({ content: "سلام", modelId: "text-only-model" })
      .expect(200);

    const events = parseSse(res.text);
    const notice = events.find((e) => e.event === "notice");
    expect((notice?.data as { code: string }).code).toBe("streaming_not_supported");
    expect((notice?.data as { message: string }).message).toContain("دهانه‌ای");
    expect(events.filter((e) => e.event === "delta")).toHaveLength(1);

    // And a client that insists on a stream is refused, not silently served one.
    stub.restore();
    stub = installFetch(() => chatCompletion("نه"));
    const strict = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages/stream`)
      .set("Cookie", auth)
      .send({ content: "سلام", modelId: "text-only-model", requireStreaming: true })
      .expect(200);
    const strictEvents = parseSse(strict.text);
    expect((strictEvents.find((e) => e.event === "error")?.data as { code: string }).code).toBe(
      "streaming_not_supported",
    );
    expect(stub.calls.filter((c) => c.url.includes("chat/completions"))).toHaveLength(0);
  });

  it("keeps the honesty contract when the provider rejects the stream", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "stream-401");
    await addProvider(app, auth, KEY_A);
    const conversation = await newConversation(app, auth);

    stub = installFetch(() => jsonResponse({ error: { message: "bad key" } }, 401));

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages/stream`)
      .set("Cookie", auth)
      .send({ content: "سلام" })
      .expect(200);

    const events = parseSse(res.text);
    expect(events.some((e) => e.event === "start")).toBe(true);
    const error = events.find((e) => e.event === "error")!.data as {
      code: string;
      message: string;
      fields: Record<string, string>;
    };
    expect(error.code).toBe("provider_auth_failed");
    expect(error.message).toMatch(/[؀-ۿ]/);
    expect(JSON.stringify(res.body ?? {})).not.toContain(KEY_A);
    expect(error.fields.userMessageId).toBeTruthy();
    expect(error.fields.failedMessageId).toBeTruthy();

    const row = await prisma.aiMessage.findFirstOrThrow({ where: { conversationId: conversation, role: "assistant" } });
    expect(row.error).toBe("provider_auth_failed");
    expect(row.content).toBe("");
  });

  it("stores what arrived before a mid-stream cut, marked as failed", async () => {
    const app = createApp();
    const { auth } = await signIn(app, "stream-cut");
    await addProvider(app, auth, KEY_A);
    const conversation = await newConversation(app, auth);

    stub = installFetch(() =>
      abortingSseResponse([openaiChunk("نیمی از پاسخ")], new TypeError("socket hang up")),
    );

    const res = await request(app)
      .post(`/api/chat/conversations/${conversation}/messages/stream`)
      .set("Cookie", auth)
      .send({ content: "سلام" })
      .expect(200);

    const events = parseSse(res.text);
    const error = events.find((e) => e.event === "error")!.data as { code: string; fields: Record<string, string> };
    expect(["ai_stream_interrupted", "ai_network_unreachable", "ai_timeout"]).toContain(error.code);
    expect(error.fields.userMessageId).toBeTruthy();

    const row = await prisma.aiMessage.findFirstOrThrow({ where: { conversationId: conversation, role: "assistant" } });
    expect(row.content).toBe("نیمی از پاسخ");
    expect(row.error).toBe(error.code);
    expect(row.modelId).toBeNull();
  });
});

function parseSse(text: string): { event: string; data: unknown }[] {
  return text
    .split(/\n\n+/)
    .map((frame) => frame.split("\n"))
    .filter((lines) => lines.some((l) => l.startsWith("data:")))
    .map((lines) => {
      const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim() ?? "message";
      const data = lines
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      return { event, data: JSON.parse(data) as unknown };
    });
}
