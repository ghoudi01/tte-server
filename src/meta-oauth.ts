import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "../shared/const";
import { encryptMetaToken, isMetaTokenCryptoConfigured } from "./meta-token-crypto";
import { getSessionById, getMerchantByUserId, upsertMerchantMetaConnection } from "./store";

function publicWebBase() {
  return (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

function publicApiBase() {
  const raw =
    process.env.PUBLIC_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? "4000"}`;
  return raw.replace(/\/$/, "");
}

function stateSecret(): string {
  return (
    process.env.META_OAUTH_STATE_SECRET?.trim() ??
    process.env.APP_KEYS?.split(",")[0]?.trim() ??
    "tte-meta-oauth-dev-only"
  );
}

function signMerchantState(merchantId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ m: merchantId, exp: Date.now() + 15 * 60 * 1000 }),
    "utf8"
  ).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyMerchantState(combined: string): string | null {
  const dot = combined.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = combined.slice(0, dot);
  const sig = combined.slice(dot + 1);
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  try {
    const j = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      m?: string;
      exp?: number;
    };
    if (!j.m || typeof j.exp !== "number" || Date.now() > j.exp) return null;
    return j.m;
  } catch {
    return null;
  }
}

async function subscribePageWebhooks(pageId: string, pageAccessToken: string) {
  const params = new URLSearchParams();
  params.set("access_token", pageAccessToken);
  params.set(
    "subscribed_fields",
    "messages,messaging_postbacks,messaging_optins,message_deliveries"
  );
  await fetch(`https://graph.facebook.com/v18.0/${pageId}/subscribed_apps`, {
    method: "POST",
    body: params,
  });
}

export function registerMetaPageOAuth(app: Express): void {
  const appId =
    process.env.META_APP_ID?.trim() ?? process.env.FACEBOOK_APP_ID?.trim() ?? "";
  const appSecret =
    process.env.META_APP_SECRET?.trim() ??
    process.env.FACEBOOK_APP_SECRET?.trim() ??
    "";

  if (!appId || !appSecret) return;

  const redirectUri = `${publicApiBase()}/api/meta/page/callback`;

  app.get("/api/meta/page/start", async (req: Request, res: Response) => {
    if (!isMetaTokenCryptoConfigured()) {
      res.status(503).send("META_TOKEN_ENCRYPTION_KEY not configured");
      return;
    }
    const sid = req.cookies?.[COOKIE_NAME];
    if (typeof sid !== "string" || !sid) {
      res.redirect(`${publicWebBase()}/login?next=/dashboard/social-sellers`);
      return;
    }
    const session = await getSessionById(sid);
    if (!session?.user) {
      res.redirect(`${publicWebBase()}/login?next=/dashboard/social-sellers`);
      return;
    }
    const merchant = await getMerchantByUserId(session.user.id);
    if (!merchant) {
      res.redirect(`${publicWebBase()}/dashboard`);
      return;
    }

    const scope = [
      "pages_show_list",
      "pages_messaging",
      "pages_manage_metadata",
      "business_management",
      "instagram_basic",
      "instagram_manage_messages",
    ].join(",");

    const url = new URL("https://www.facebook.com/v18.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", scope);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", signMerchantState(merchant.id));

    res.redirect(url.toString());
  });

  app.get("/api/meta/page/callback", async (req: Request, res: Response) => {
    const web = publicWebBase();
    try {
      const code = typeof req.query.code === "string" ? req.query.code : null;
      const stateRaw = typeof req.query.state === "string" ? req.query.state : null;
      const merchantId = stateRaw ? verifyMerchantState(stateRaw) : null;
      if (!code || !merchantId) {
        res.redirect(`${web}/dashboard/social-sellers?meta=error`);
        return;
      }

      const tokenUrl = new URL("https://graph.facebook.com/v18.0/oauth/access_token");
      tokenUrl.searchParams.set("client_id", appId);
      tokenUrl.searchParams.set("client_secret", appSecret);
      tokenUrl.searchParams.set("redirect_uri", redirectUri);
      tokenUrl.searchParams.set("code", code);

      const tokenRes = await fetch(tokenUrl.toString());
      const tokenJson = (await tokenRes.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (!tokenRes.ok || !tokenJson.access_token) {
        res.redirect(`${web}/dashboard/social-sellers?meta=token`);
        return;
      }

      let userToken = tokenJson.access_token;

      const longUrl = new URL("https://graph.facebook.com/v18.0/oauth/access_token");
      longUrl.searchParams.set("grant_type", "fb_exchange_token");
      longUrl.searchParams.set("client_id", appId);
      longUrl.searchParams.set("client_secret", appSecret);
      longUrl.searchParams.set("fb_exchange_token", userToken);
      const longRes = await fetch(longUrl.toString());
      const longJson = (await longRes.json()) as { access_token?: string };
      if (longRes.ok && longJson.access_token) {
        userToken = longJson.access_token;
      }

      const accountsUrl = new URL("https://graph.facebook.com/v18.0/me/accounts");
      accountsUrl.searchParams.set("fields", "name,id,access_token,instagram_business_account");
      accountsUrl.searchParams.set("access_token", userToken);
      const accRes = await fetch(accountsUrl.toString());
      const accJson = (await accRes.json()) as {
        data?: Array<{
          id: string;
          access_token: string;
          name?: string;
          instagram_business_account?: { id: string };
        }>;
      };

      const pages = accJson.data ?? [];
      if (pages.length === 0) {
        res.redirect(`${web}/dashboard/social-sellers?meta=nopages`);
        return;
      }

      for (const p of pages) {
        try {
          const igId = p.instagram_business_account?.id;
          const enc = encryptMetaToken(p.access_token);
          await upsertMerchantMetaConnection({
            merchantId,
            facebookPageId: p.id,
            instagramBusinessAccountId: igId,
            pageAccessTokenEnc: enc,
            tokenExpiresAt: undefined,
          });
          await subscribePageWebhooks(p.id, p.access_token);
        } catch {
          /* skip page if encrypt / persist fails */
        }
      }

      res.redirect(`${web}/dashboard/social-sellers?meta=connected`);
    } catch {
      res.redirect(`${web}/dashboard/social-sellers?meta=exception`);
    }
  });
}
