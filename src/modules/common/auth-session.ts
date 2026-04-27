import type { Request } from "express";
import jwt from "jsonwebtoken";

export type SessionUser = {
  id: string;
  email: string;
};

const AUTH_COOKIE_NAME = "tte_token";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  return "dev-jwt-secret-change-me";
}

export function signAuthToken(user: SessionUser) {
  return jwt.sign(user, getJwtSecret(), { expiresIn: "7d" });
}

export function readUserFromRequest(req: Request): SessionUser | null {
  const token =
    req.cookies?.[AUTH_COOKIE_NAME] ??
    req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as SessionUser;
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
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  };
}
