import type { CookieOptions } from "express";
import { ONE_YEAR_MS } from "../shared/const";

/**
 * Cross-origin SPA (e.g. Vercel) calling API (e.g. Render) uses fetch + credentials.
 * SameSite=Lax session cookies are not sent on those requests; use SameSite=None; Secure.
 *
 * Default SameSite=None whenever NODE_ENV is not explicitly `development` (covers hosts where
 * NODE_ENV is unset/staging). Override with SESSION_COOKIE_SAMESITE=lax for same-origin API+web.
 */
export function getSessionCookieOptions(): CookieOptions {
  const raw = process.env.SESSION_COOKIE_SAMESITE?.toLowerCase();
  const sameSite: CookieOptions["sameSite"] =
    raw === "lax" || raw === "strict" || raw === "none"
      ? raw
      : process.env.NODE_ENV === "development"
        ? "lax"
        : "none";

  const secure =
    process.env.SESSION_COOKIE_SECURE === "false"
      ? false
      : sameSite === "none"
        ? true
        : process.env.NODE_ENV !== "development";

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: "/",
    maxAge: ONE_YEAR_MS,
  };
}

/** Subset required so browsers reliably clear cookies set with SameSite=None. */
export function getSessionCookieClearOptions(): CookieOptions {
  const o = getSessionCookieOptions();
  return {
    path: o.path ?? "/",
    sameSite: o.sameSite,
    secure: o.secure,
    httpOnly: o.httpOnly,
  };
}
