import type { Express, Request, Response } from "express";
import {
  createOrder,
  getApiUsageSummary,
  getMerchantByApiKey,
  recordApiUsage,
  recordPluginWebhookEvent,
} from "./store";

function apiKeyFromReq(req: Request): string | null {
  const x = req.headers["x-api-key"] ?? req.headers["x-tte-api-key"];
  if (typeof x === "string" && x) return x;
  const a = req.headers.authorization;
  if (a?.startsWith("Bearer ")) return a.slice(7).trim();
  return null;
}

async function withMerchant(
  req: Request,
  res: Response,
  route: string,
  next: (merchantId: string) => Promise<void>
) {
  const key = apiKeyFromReq(req);
  if (!key) {
    res.status(401).json({ error: "Missing API key (X-API-Key or Authorization: Bearer)" });
    return;
  }
  const merchant = await getMerchantByApiKey(key);
  if (!merchant) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }
  await recordApiUsage(merchant.id, route);
  await next(merchant.id);
}

export function registerPluginApiRoutes(app: Express): void {
  app.get("/api/plugin/usage", async (req: Request, res: Response) => {
    await withMerchant(req, res, "GET /api/plugin/usage", async merchantId => {
      const summary = await getApiUsageSummary(merchantId);
      res.json(summary);
    });
  });

  app.post("/api/plugin/orders", async (req: Request, res: Response) => {
    await withMerchant(req, res, "POST /api/plugin/orders", async merchantId => {
      const body = req.body as {
        customerName?: string;
        phoneNumber?: string;
        city?: string;
        orderAmount?: number;
      };
      if (
        typeof body.customerName !== "string" ||
        typeof body.phoneNumber !== "string" ||
        typeof body.orderAmount !== "number"
      ) {
        res.status(400).json({
          error: "Expected JSON { customerName, phoneNumber, orderAmount, city? }",
        });
        return;
      }
      const order = await createOrder({
        merchantId,
        customerName: body.customerName,
        phoneNumber: body.phoneNumber,
        city: typeof body.city === "string" ? body.city : undefined,
        orderAmount: body.orderAmount,
        status: "pending",
        verificationStatus: "pending",
      });
      res.status(201).json({ id: order.id, createdAt: order.createdAt });
    });
  });

  app.post("/api/plugin/webhooks/shopify", async (req: Request, res: Response) => {
    await withMerchant(req, res, "POST /api/plugin/webhooks/shopify", async merchantId => {
      const preview = JSON.stringify(req.body ?? {}).slice(0, 1500);
      await recordPluginWebhookEvent(merchantId, "shopify", preview);
      res.json({ ok: true });
    });
  });

  app.post("/api/plugin/webhooks/woocommerce", async (req: Request, res: Response) => {
    await withMerchant(req, res, "POST /api/plugin/webhooks/woocommerce", async merchantId => {
      const preview = JSON.stringify(req.body ?? {}).slice(0, 1500);
      await recordPluginWebhookEvent(merchantId, "woocommerce", preview);
      res.json({ ok: true });
    });
  });
}
