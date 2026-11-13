import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.js";

const key = new TextEncoder().encode(env.SESSION_SECRET);

export type SessionClaims = { sid: string; uid: string };

export async function createSessionToken(sid: string, userId: string): Promise<string> {
  return new SignJWT({ sid, uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("fitplaner-api")
    .setExpirationTime(`${env.SESSION_TTL_DAYS}d`)
    .sign(key);
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: "fitplaner-api" });
    if (typeof payload.sid !== "string" || typeof payload.uid !== "string") return null;
    return { sid: payload.sid, uid: payload.uid };
  } catch {
    return null;
  }
}
