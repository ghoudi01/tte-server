import type { Request } from "express";
import jwt from "jsonwebtoken";

export type SessionUser = {
  id: string;
  email: string;
};

const AUTH_COOKIE_NAME = "tte_token";

export function signAuthToken(user: SessionUser) {
  const secret = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
  return jwt.sign(user, secret, { expiresIn: "7d" });
}

export function readUserFromRequest(req: Request): SessionUser | null {
  const token =
    req.cookies?.[AUTH_COOKIE_NAME] ??
    req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  try {
    const secret = process.env.JWT_SECRET || "dev-jwt-secret-change-me";
    const decoded = jwt.verify(token, secret) as SessionUser;
    return { id: decoded.id, email: decoded.email };
  } catch {
    return null;
  }
}

export function authCookie(token: string) {
  return {
    name: AUTH_COOKIE_NAME,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: false,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  };
}
