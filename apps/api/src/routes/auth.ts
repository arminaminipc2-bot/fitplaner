import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { env, isProd } from "../env.js";
import { zEmail } from "../domain.js";
import { AppError, ok, parseBody } from "../http.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { currentSession } from "../auth/current.js";
import { createSessionToken } from "../auth/session.js";
import { clearSessionCookie, setSessionCookie } from "../auth/cookies.js";

export const authRouter = Router();

const passwordSchema = z.string().min(1).max(200);
const credentialsSchema = z.object({ email: zEmail, password: passwordSchema });

function assertStrongPassword(password: string) {
  if (password.length < 8) {
    throw AppError.validation({ password: "رمز عبور باید حداقل ۸ نویسه باشد." });
  }
}

/**
 * The row is the revocation list: logout deletes it, so a stolen cookie dies
 * with the session instead of living out its token lifetime.
 */
async function startSession(userId: string, userAgent: string | undefined, res: Response) {
  const id = randomBytes(12).toString("hex");
  await prisma.authSession.create({
    data: {
      id,
      userId,
      expiresAt: new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000),
      userAgent: userAgent?.slice(0, 200) ?? null,
    },
  });
  setSessionCookie(res, await createSessionToken(id, userId));
}

authRouter.post("/register", async (req, res) => {
  const body = parseBody(
    z.object({
      email: zEmail,
      password: passwordSchema,
      displayName: z.string().trim().min(1).max(60).optional(),
    }),
    req.body,
  );

  assertStrongPassword(body.password);

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    throw AppError.conflict(
      "email_taken",
      "این ایمیل قبلاً ثبت شده است. وارد شوید یا رمز را بازیابی کنید.",
    );
  }

  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash: await hashPassword(body.password),
      profile: { create: { displayName: body.displayName ?? null } },
    },
  });

  await startSession(user.id, req.headers["user-agent"], res);
  ok(res, { id: user.id, email: user.email, onboardingStep: 0 }, 201);
});

authRouter.post("/login", async (req, res) => {
  const body = parseBody(credentialsSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email }, include: { profile: true } });

  // Same message and comparable work either way, so this endpoint cannot be
  // used to discover whether an address has an account.
  const hash = user?.passwordHash ?? (await hashPassword("fitplaner-timing-equaliser"));
  const valid = await verifyPassword(body.password, hash);
  if (!user || !valid) {
    throw AppError.conflict("bad_credentials", "ایمیل یا رمز عبور درست نیست.");
  }

  await startSession(user.id, req.headers["user-agent"], res);
  ok(res, {
    id: user.id,
    email: user.email,
    onboardingStep: user.profile?.onboardingStep ?? 0,
    onboardingCompleted: Boolean(user.profile?.onboardingCompletedAt),
  });
});

authRouter.post("/logout", async (req, res) => {
  const session = await currentSession(req);
  if (session) await prisma.authSession.delete({ where: { id: session.id } });
  clearSessionCookie(res);
  ok(res, { loggedOut: true });
});

/** Never an error when signed out: the frontend calls this on every boot. */
authRouter.get("/me", async (req, res) => {
  const session = await currentSession(req);
  if (!session) return ok(res, { user: null });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { profile: true },
  });
  if (!user) return ok(res, { user: null });

  ok(res, {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.profile?.displayName ?? null,
      onboardingStep: user.profile?.onboardingStep ?? 0,
      onboardingCompleted: Boolean(user.profile?.onboardingCompletedAt),
    },
  });
});

// ---------- password recovery ----------

authRouter.post("/password-reset/request", async (req, res) => {
  const body = parseBody(z.object({ email: zEmail }), req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });

  if (!user) return ok(res, { requested: true });

  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });

  if (isProd) {
    // No mail transport is configured in this build. Claiming an email was
    // sent would be a lie, so the endpoint reports what is actually missing.
    throw new AppError(
      503,
      "email_provider_not_configured",
      "ارسال ایمیل در این محیط پیکربندی نشده است. برای فعال‌سازی یک سرویس ایمیل سمت سرور لازم است.",
    );
  }

  // Development only: the token comes back so the flow can be finished and
  // tested without a mail server.
  ok(res, { requested: true, devResetToken: token });
});

authRouter.post("/password-reset/confirm", async (req, res) => {
  const body = parseBody(z.object({ token: z.string().min(32).max(128), password: passwordSchema }), req.body);
  assertStrongPassword(body.password);

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(body.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw AppError.conflict("reset_invalid", "لینک بازیابی معتبر نیست یا منقضی شده است.");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(body.password) },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // A password change invalidates every other device.
    prisma.authSession.deleteMany({ where: { userId: record.userId } }),
  ]);

  ok(res, { changed: true });
});

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
