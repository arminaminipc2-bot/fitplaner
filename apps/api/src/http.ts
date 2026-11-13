import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { currentSession, touchSession } from "./auth/current.js";

/**
 * Every failure the API returns is an AppError with a stable machine code and a
 * Persian sentence the UI can show as-is. The UI never translates codes itself,
 * so the wording stays in one place.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }

  static unauthorized() {
    return new AppError(401, "unauthorized", "برای ادامه وارد شوید.");
  }
  static notFound(what = "مورد") {
    return new AppError(404, "not_found", `${what} یافت نشد.`);
  }
  static conflict(code: string, message: string) {
    return new AppError(409, code, message);
  }
  static validation(fields: Record<string, string>) {
    return new AppError(422, "validation_failed", "لطفاً ورودی‌ها را اصلاح کنید.", fields);
  }
}

export function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ ok: true, data });
}

/**
 * Parse a request body against a schema, turning zod issues into a per-field
 * Persian map. Schemas are closed by convention: an unexpected key is dropped
 * rather than guessed at, so a typo cannot silently become a different field.
 */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = fieldMessage(issue);
  }
  throw AppError.validation(fields);
}

function fieldMessage(issue: z.ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return "این فیلد الزامی است.";
    case "too_small":
      return "مقدار واردشده خیلی کوتاه است.";
    case "too_big":
      return "مقدار واردشده خیلی بزرگ است.";
    case "invalid_format":
      return "قالب واردشده معتبر نیست.";
    case "unrecognized_keys":
      return "این کلید شناخته‌شده نیست.";
    default:
      return "مقدار واردشده معتبر نیست.";
  }
}

// ---------- session ----------

declare module "express" {
  interface Request {
    user?: { id: string };
  }
}

export const SESSION_COOKIE = "fitplaner_session";

/** Minimal cookie reader — the API needs one cookie, not a parser dependency. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const session = await currentSession(req);
  if (!session) return next(AppError.unauthorized());

  req.user = { id: session.userId };
  await touchSession(session.id);
  next();
}

/** userId of the authenticated caller — throws instead of returning undefined. */
export function uid(req: Request): string {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const e =
    err instanceof AppError
      ? err
      : new AppError(500, "internal_error", "مشکلی در سرور پیش آمد. کمی بعد دوباره تلاش کنید.");
  if (!(err instanceof AppError)) console.error(err);
  res.status(e.status).json({
    ok: false,
    error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) },
  });
}
