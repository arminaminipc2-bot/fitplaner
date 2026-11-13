import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config(); // load from cwd
dotenv.config({ path: path.resolve(here, "../.env") }); // load from package root

/**
 * An empty value in a hand-edited .env ("PORT=") means "not set", not zero.
 * Without this, one blank line made every module fail at import time.
 */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalInt = (min: number, max: number, fallback: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).default(fallback));

/**
 * A machine-wide `PORT=0` (seen in this project's environment) is not a usable
 * listen port here; fall back to the documented default rather than crash.
 */
const usablePort = (value: unknown): unknown =>
  blankToUndefined(value) === "0" ? undefined : value;

const schema = z.object({
  NODE_ENV: z.preprocess(
    blankToUndefined,
    z.enum(["development", "test", "production"]).default("development"),
  ),
  PORT: z.preprocess(usablePort, z.coerce.number().int().min(1).max(65535).default(8787)),
  SESSION_SECRET: z.preprocess(
    blankToUndefined,
    z.string().min(16).default("dev-only-insecure-secret-change-me"),
  ),
  DATABASE_URL: z.preprocess(blankToUndefined, z.string().default("file:./dev.db")),
  /** Session cookie lifetime. */
  SESSION_TTL_DAYS: optionalInt(1, 365, 30),
  /** 64 hex chars (32 bytes) — encrypts provider API keys at rest. */
  DATA_ENCRYPTION_KEY: z.preprocess(blankToUndefined, z.string().length(64).optional()),

  // ---------- AI outbound calls ----------
  /** Hard deadline for one provider round-trip, stream included. */
  AI_TIMEOUT_MS: optionalInt(2_000, 300_000, 45_000),
  /** A stream that sends nothing for this long is considered dead. */
  AI_STREAM_IDLE_MS: optionalInt(1_000, 120_000, 30_000),
  /** Bound on the bytes read from a provider, so a hostile body cannot grow. */
  AI_MAX_RESPONSE_BYTES: optionalInt(10_000, 20_000_000, 4_000_000),
  /** Bound on one inbound image (data URL) handed to a vision model. */
  AI_MAX_IMAGE_BYTES: optionalInt(10_000, 20_000_000, 4_000_000),
  /** History window handed to the model, measured in persisted messages. */
  AI_HISTORY_MESSAGES: optionalInt(2, 100, 24),
});

export const env = schema.parse(process.env);

if (env.NODE_ENV === "production" && env.SESSION_SECRET === "dev-only-insecure-secret-change-me") {
  throw new Error("SESSION_SECRET must be set in production");
}

export const isProd = env.NODE_ENV === "production";
