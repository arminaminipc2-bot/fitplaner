import type { Request } from "express";
import { prisma } from "../db.js";
import { readCookie, SESSION_COOKIE } from "../http.js";
import { verifySessionToken } from "./session.js";

/**
 * Resolve the cookie to a live session row. Everything that needs to know who
 * is calling goes through here, so revocation is checked in exactly one place.
 */
export async function currentSession(req: Request) {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const session = await prisma.authSession.findUnique({ where: { id: claims.sid } });
  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

export async function touchSession(id: string) {
  await prisma.authSession.update({ where: { id }, data: { lastSeenAt: new Date() } });
}
