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

export function registerGoogleOAuth(app: Express): void {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return;

  const redirectUri = `${publicApiBase()}/api/auth/google/callback`;

  app.get("/api/auth/google/start", (_req: Request, res: Response) => {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    res.redirect(url.toString());
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    try {
      const code = typeof req.query.code === "string" ? req.query.code : null;
      if (!code) {
        res.redirect(`${publicWebBase()}/login?oauth=error`);
        return;
      }
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
      if (!tokenRes.ok || !tokenJson.access_token) {
        res.redirect(`${publicWebBase()}/login?oauth=token`);
        return;
      }
      const uiRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const profile = (await uiRes.json()) as { email?: string; email_verified?: boolean };
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
      res.redirect(`${publicWebBase()}/login?oauth=exception`);
    }
  });
}
