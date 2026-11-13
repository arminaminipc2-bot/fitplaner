import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { clearDb, cookie, newEmail } from "./helpers.js";

describe("auth", () => {
  beforeEach(clearDb);

  it("rejects a short password with a Persian field message", async () => {
    const res = await request(createApp())
      .post("/api/auth/register")
      .send({ email: newEmail("short"), password: "abc" })
      .expect(422);
    expect(res.body.error.fields.password).toBe("رمز عبور باید حداقل ۸ نویسه باشد.");
  });

  it("does not reveal whether an email is registered", async () => {
    const app = createApp();
    const email = newEmail("exists");
    await request(app).post("/api/auth/register").send({ email, password: "kashefi-1384" }).expect(201);

    const wrongPassword = await request(app).post("/api/auth/login").send({ email, password: "nah-nah-1" });
    const wrongEmail = await request(app).post("/api/auth/login").send({ email: newEmail("ghost"), password: "nah-nah-1" });

    expect(wrongPassword.status).toBe(wrongEmail.status);
    expect(wrongPassword.body.error.message).toBe(wrongEmail.body.error.message);
  });

  it("refuses a duplicate registration", async () => {
    const app = createApp();
    const email = newEmail("dup");
    await request(app).post("/api/auth/register").send({ email, password: "kashefi-1384" }).expect(201);
    await request(app).post("/api/auth/register").send({ email, password: "kashefi-1384" }).expect(409);
  });

  it("protects every data route when signed out", async () => {
    const app = createApp();
    await request(app).get("/api/home").expect(401);
    await request(app).get("/api/measurements").expect(401);
    await request(app).post("/api/training/workouts").send({}).expect(401);
    expect((await request(app).get("/api/auth/me")).body.data.user).toBeNull();
  });

  it("issues a dev-only reset token that actually changes the password", async () => {
    const app = createApp();
    const email = newEmail("reset");
    const registered = await request(app).post("/api/auth/register").send({ email, password: "kashefi-1384" }).expect(201);
    const firstCookie = cookie(registered);

    const asked = await request(app).post("/api/auth/password-reset/request").send({ email }).expect(200);
    const token = asked.body.data.devResetToken as string;
    expect(token).toHaveLength(64);

    await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token, password: "tamam-1404-aval" })
      .expect(200);

    // The old session is gone the moment the password changes.
    await request(app).get("/api/home").set("Cookie", firstCookie).expect(401);
    await request(app).post("/api/auth/login").send({ email, password: "kashefi-1384" }).expect(409);
    await request(app).post("/api/auth/login").send({ email, password: "tamam-1404-aval" }).expect(200);
    await request(app).post("/api/auth/password-reset/confirm").send({ token, password: "digar-1404" }).expect(409);
  });
});
