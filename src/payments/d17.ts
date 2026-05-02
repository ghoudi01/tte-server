/**
 * La Poste Tunisienne D17 — contract-specific; env maps to your PSP/checkout URL.
 * Set D17_CREATE_PAYMENT_URL to the full POST endpoint, or D17_API_BASE_URL + D17_CREATE_PAYMENT_PATH.
 */

function resolveCreateUrl(): string {
  const full = process.env.D17_CREATE_PAYMENT_URL?.replace(/\/$/, "");
  if (full) return full;
  const base = process.env.D17_API_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("D17_CREATE_PAYMENT_URL or D17_API_BASE_URL is required");
  const path = process.env.D17_CREATE_PAYMENT_PATH ?? "/payments";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function d17CreatePayment(opts: {
  amountMillimes: number;
  trackingId: string;
  successUrl: string;
  failUrl: string;
  webhookUrl: string;
  customerLabel: string;
}): Promise<{ checkoutUrl: string; providerReference?: string }> {
  const url = resolveCreateUrl();
  const key = process.env.D17_API_KEY;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;

  const body: Record<string, unknown> = {
    amount_millimes: opts.amountMillimes,
    external_ref: opts.trackingId,
    developer_tracking_id: opts.trackingId,
    success_url: opts.successUrl,
    cancel_url: opts.failUrl,
    fail_url: opts.failUrl,
    webhook_url: opts.webhookUrl,
    client_id: opts.customerLabel.slice(0, 120),
  };

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const data = (await res.json()) as Record<string, unknown>;
  const checkoutUrl =
    (typeof data.checkout_url === "string" && data.checkout_url) ||
    (typeof data.url === "string" && data.url) ||
    (typeof data.link === "string" && data.link) ||
    (typeof data.payment_url === "string" && data.payment_url) ||
    (data.result &&
      typeof data.result === "object" &&
      data.result !== null &&
      typeof (data.result as { url?: string }).url === "string" &&
      (data.result as { url: string }).url) ||
    undefined;

  if (!res.ok || typeof checkoutUrl !== "string") {
    const msg =
      typeof data.message === "string"
        ? data.message
        : `D17 create payment failed (${res.status})`;
    throw new Error(msg);
  }

  const ref =
    (typeof data.id === "string" && data.id) ||
    (typeof data.payment_id === "string" && data.payment_id) ||
    undefined;

  return { checkoutUrl, providerReference: ref };
}
