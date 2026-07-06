import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "../../shared/const";
import { createOAuthUser, createSessionForUser, getUserByEmail } from "../store";
import { getSessionCookieOptions } from "../session-cookie";

function publicWebBase() {
  return (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

function publicApiBase() {
  const raw =
    process.env.PUBLIC_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? "4000"}`;
  return raw.replace(/\/$/, "");
}

export function registerFacebookOAuth(app: Express): void {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) return;

  const redirectUri = `${publicApiBase()}/api/auth/facebook/callback`;

  app.get("/api/auth/facebook/start", (_req: Request, res: Response) => {
    const url = new URL("https://www.facebook.com/v18.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "email,public_profile");
    url.searchParams.set("response_type", "code");
    res.redirect(url.toString());
  });

  app.get("/api/auth/facebook/callback", async (req: Request, res: Response) => {
    try {
      const code = typeof req.query.code === "string" ? req.query.code : null;
      if (!code) {
        res.redirect(`${publicWebBase()}/login?oauth=facebook_error`);
        return;
      }
      const tokenUrl = new URL("https://graph.facebook.com/v18.0/oauth/access_token");
      tokenUrl.searchParams.set("client_id", appId);
      tokenUrl.searchParams.set("redirect_uri", redirectUri);
      tokenUrl.searchParams.set("client_secret", appSecret);
      tokenUrl.searchParams.set("code", code);
      const tokenRes = await fetch(tokenUrl.toString());
      const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: { message?: string } };
      if (!tokenRes.ok || !tokenJson.access_token) {
        res.redirect(`${publicWebBase()}/login?oauth=facebook_token`);
        return;
      }
      const meUrl = new URL("https://graph.facebook.com/me");
      meUrl.searchParams.set("fields", "id,name,email");
      meUrl.searchParams.set("access_token", tokenJson.access_token);
      const meRes = await fetch(meUrl.toString());
      const profile = (await meRes.json()) as { email?: string; id?: string };
      const email = profile.email?.toLowerCase().trim();
      if (!email) {
        res.redirect(`${publicWebBase()}/login?oauth=noemail`);
        return;
      }
      let user = await getUserByEmail(email);
      if (!user) {
        user = await createOAuthUser(email);
      }
      const session = await createSessionForUser(user);
      res.cookie(COOKIE_NAME, session.id, getSessionCookieOptions());
      res.redirect(`${publicWebBase()}/dashboard`);
    } catch {
      res.redirect(`${publicWebBase()}/login?oauth=facebook_exception`);
    }
  });
}
