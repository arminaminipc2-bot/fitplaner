import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { clearDb, cookie, newEmail } from "./helpers.js";
import { decryptSecret } from "../src/secrets.js";

async function signup(app: ReturnType<typeof createApp>, tag: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email: newEmail(tag), password: "kashefi-1384" })
    .expect(201);
  return cookie(res);
}

describe("provider keys", () => {
  beforeEach(clearDb);

  it("stores a key encrypted and returns only a mask", async () => {
    const app = createApp();
    const auth = await signup(app, "keys");

    const created = await request(app)
      .post("/api/ai/providers")
      .set("Cookie", auth)
      .send({ provider: "openai", label: "کلید شخصی", apiKey: "sk-proj-abcdef1234567890" })
      .expect(201);

    expect(created.body.data.keyMask).toBe("sk-…7890");
    expect(JSON.stringify(created.body)).not.toContain("abcdef");

    await request(app).get("/api/ai/providers").set("Cookie", auth).expect(200);

    // What is on disk is ciphertext, and it decrypts back to the real key.
    const stored = await prisma.aiProviderConfig.findFirstOrThrow();
    expect(stored.keyCipher).not.toContain("sk-proj");
    expect(decryptSecret(stored)).toBe("sk-proj-abcdef1234567890");
  });

  it("keeps one user's providers away from another", async () => {
    const app = createApp();
    const a = await signup(app, "provider-a");
    const b = await signup(app, "provider-b");

    const created = await request(app)
      .post("/api/ai/providers")
      .set("Cookie", a)
      .send({ provider: "gemini", label: "کلید من", apiKey: "AIzaSy-abcdefghijklmnop" })
      .expect(201);

    const listed = await request(app).get("/api/ai/providers").set("Cookie", b).expect(200);
    expect(listed.body.data.items).toHaveLength(0);

    await request(app).patch(`/api/ai/providers/${created.body.data.id}`).set("Cookie", b).send({ label: "دست‌کاری" }).expect(404);
    await request(app).delete(`/api/ai/providers/${created.body.data.id}`).set("Cookie", b).expect(404);
  });

  it("tells the user the assistant is not configured instead of inventing an answer", async () => {
    const app = createApp();
    const auth = await signup(app, "chat");

    const conversation = await request(app)
      .post("/api/chat/conversations")
      .set("Cookie", auth)
      .send({ assistant: "coach" })
      .expect(201);

    const failed = await request(app)
      .post(`/api/chat/conversations/${conversation.body.data.id}/messages`)
      .set("Cookie", auth)
      .send({ content: "برنامه هفته را سنگین‌تر کن" })
      .expect(503);

    expect(failed.body.error.code).toBe("ai_not_configured");
    expect(failed.body.error.message).toContain("هوش مصنوعی");

    const detail = await request(app)
      .get(`/api/chat/conversations/${conversation.body.data.id}`)
      .set("Cookie", auth)
      .expect(200);
    expect(detail.body.data.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    expect(detail.body.data.messages[1].content).toBe("");
    expect(detail.body.data.messages[1].error).toBe("ai_not_configured");
  });
});
