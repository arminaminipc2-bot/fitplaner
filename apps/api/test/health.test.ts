import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /api/health", () => {
  it("reports the api and the database are up", async () => {
    const res = await request(createApp()).get("/api/health").expect(200);
    expect(res.body.service).toBe("fitplaner-api");
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe("ok");
  });

  it("answers unknown api routes with a machine-readable error", async () => {
    const res = await request(createApp()).get("/api/does-not-exist").expect(401);
    expect(res.body.error.code).toBe("unauthorized");
  });
});
