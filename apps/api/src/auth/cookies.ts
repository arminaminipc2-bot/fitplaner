import type { Response } from "express";
import { env, isProd } from "../env.js";
import { SESSION_COOKIE } from "../http.js";

const maxAgeSec = env.SESSION_TTL_DAYS * 24 * 60 * 60;

// httpOnly: the token is never readable from page script, so an XSS in the
// frontend cannot steal a session. SameSite=lax keeps it working for the
// top-level navigations a SPA actually makes.
export function setSessionCookie(res: Response, token: string) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${isProd ? "; Secure" : ""}`,
  );
}

export function clearSessionCookie(res: Response) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? "; Secure" : ""}`,
  );
}
