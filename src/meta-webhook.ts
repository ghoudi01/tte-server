import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { decryptMetaToken, isMetaTokenCryptoConfigured } from "./meta-token-crypto";
import { handleInboundMessaging } from "./meta-flow-handler";
import { getMerchantMetaConnectionByPageOrInstagramId } from "./store";

function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected =
    "sha256=" +
    createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

type MessagingEvent = Record<string, unknown>;

type WebhookEntry = {
  id: string;
  messaging?: MessagingEvent[];
};

export function registerMetaWebhookRoutes(app: Express): void {
  app.get("/api/webhooks/meta", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const verify = process.env.META_VERIFY_TOKEN ?? "";
    if (mode === "subscribe" && typeof token === "string" && token === verify && verify) {
      res.status(200).send(typeof challenge === "string" ? challenge : "");
      return;
    }
    res.sendStatus(403);
  });

  app.post("/api/webhooks/meta", async (req: Request, res: Response) => {
    const secret =
      process.env.META_APP_SECRET?.trim() ??
      process.env.FACEBOOK_APP_SECRET?.trim() ??
      "";
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const sig = req.headers["x-hub-signature-256"];
    if (!secret || !rawBody) {
      res.sendStatus(400);
      return;
    }
    if (!verifyMetaSignature(rawBody, typeof sig === "string" ? sig : undefined, secret)) {
      res.sendStatus(403);
      return;
    }

    res.sendStatus(200);

    if (!isMetaTokenCryptoConfigured()) return;

    const body = req.body as {
      object?: string;
      entry?: WebhookEntry[];
    };

    const objectType = body.object;
    const channel: "messenger" | "instagram" =
      objectType === "instagram" ? "instagram" : "messenger";

    for (const entry of body.entry ?? []) {
      const metaEntryId = entry.id;
      if (!metaEntryId) continue;

      const conn = await getMerchantMetaConnectionByPageOrInstagramId(metaEntryId);
      if (!conn) continue;

      let pageAccessTokenPlain: string;
      try {
        pageAccessTokenPlain = decryptMetaToken(conn.page_access_token_enc);
      } catch {
        continue;
      }

      for (const ev of entry.messaging ?? []) {
        const sender = ev.sender as { id?: string } | undefined;
        const senderId = sender?.id;
        if (!senderId) continue;

        void handleInboundMessaging({
          metaEntryId,
          channel,
          senderId,
          merchantId: conn.merchant_id,
          pageAccessTokenPlain,
          messaging: ev,
        }).catch(() => {
          /* logged elsewhere if needed */
        });
      }
    }
  });
}
