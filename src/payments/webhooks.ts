import type { Express, Request, Response } from "express";
import {
  fulfillPaymentOrderWithCredits,
  getPaymentOrderById,
  updatePaymentOrderProviderId,
} from "../store";
import { flouciVerifyPayment } from "./flouci";

function extractPaymentId(body: Record<string, unknown>): string | null {
  if (typeof body.payment_id === "string") return body.payment_id;
  if (typeof body.paymentId === "string") return body.paymentId;
  const r = body.result;
  if (r && typeof r === "object" && r !== null && "payment_id" in r) {
    const id = (r as { payment_id?: unknown }).payment_id;
    if (typeof id === "string") return id;
  }
  return null;
}

export function registerPaymentRoutes(app: Express): void {
  app.post("/api/webhooks/flouci", async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const paymentId = extractPaymentId(body);
      if (!paymentId) {
        res.status(400).json({ ok: false, error: "missing payment_id" });
        return;
      }

      const v = await flouciVerifyPayment(paymentId);
      if (!v.ok || !v.developerTrackingId) {
        res.status(200).json({ ok: false, skipped: true, reason: v.status ?? "not_success" });
        return;
      }

      const order = await getPaymentOrderById(v.developerTrackingId);
      if (!order || order.gateway !== "flouci") {
        res.status(200).json({ ok: false, skipped: true, reason: "unknown_order" });
        return;
      }

      if (
        v.amountMillimes != null &&
        v.amountMillimes !== order.amountMillimes
      ) {
        console.warn("[flouci webhook] amount mismatch", {
          orderId: order.id,
          expected: order.amountMillimes,
          got: v.amountMillimes,
        });
        res.status(400).json({ ok: false, error: "amount_mismatch" });
        return;
      }

      if (order.providerPaymentId && order.providerPaymentId !== paymentId) {
        res.status(400).json({ ok: false, error: "payment_id_mismatch" });
        return;
      }

      await updatePaymentOrderProviderId(order.id, paymentId);

      const out = await fulfillPaymentOrderWithCredits(order.id);
      res.json({
        ok: out.status === "granted" || out.status === "already_completed",
        status: out.status,
      });
    } catch (e) {
      console.error("[flouci webhook]", e);
      res.status(500).json({ ok: false });
    }
  });

  app.post("/api/webhooks/d17", async (req: Request, res: Response) => {
    try {
      const secret = process.env.D17_WEBHOOK_SECRET;
      if (secret) {
        const h = req.headers["x-d17-secret"] ?? req.headers["x-webhook-secret"];
        if (h !== secret) {
          res.status(401).json({ ok: false });
          return;
        }
      }

      const body = req.body as Record<string, unknown>;
      const trackingId =
        (typeof body.tracking_id === "string" && body.tracking_id) ||
        (typeof body.developer_tracking_id === "string" && body.developer_tracking_id) ||
        (typeof body.external_ref === "string" && body.external_ref) ||
        null;

      const statusRaw =
        typeof body.status === "string" ? body.status.toLowerCase() : "";
      const paid =
        statusRaw === "paid" ||
        statusRaw === "success" ||
        body.success === true ||
        statusRaw === "completed";

      if (!trackingId || !paid) {
        res.status(200).json({ ok: false, skipped: true });
        return;
      }

      const order = await getPaymentOrderById(trackingId);
      if (!order || order.gateway !== "d17") {
        res.status(200).json({ ok: false, skipped: true, reason: "unknown_order" });
        return;
      }

      const prov =
        (typeof body.payment_id === "string" && body.payment_id) ||
        (typeof body.transaction_id === "string" && body.transaction_id);
      if (typeof prov === "string" && prov) {
        await updatePaymentOrderProviderId(order.id, prov);
      }

      const out = await fulfillPaymentOrderWithCredits(trackingId);
      res.json({
        ok: out.status === "granted" || out.status === "already_completed",
        status: out.status,
      });
    } catch (e) {
      console.error("[d17 webhook]", e);
      res.status(500).json({ ok: false });
    }
  });
}
