/**
 * Public URLs for redirects and webhooks (no trailing slash).
 */
export function getPublicWebBase(): string {
  return (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

export function getPublicApiBase(): string {
  const raw =
    process.env.PUBLIC_API_URL ??
    `http://127.0.0.1:${process.env.PORT ?? "4000"}`;
  return raw.replace(/\/$/, "");
}

export function flouciConfigured(): boolean {
  return !!process.env.FLOUCI_PUBLIC_KEY && !!process.env.FLOUCI_PRIVATE_KEY;
}

export function d17Configured(): boolean {
  return !!process.env.D17_CREATE_PAYMENT_URL || !!process.env.D17_API_BASE_URL;
}

export function allowDirectCreditPurchase(): boolean {
  return process.env.ALLOW_DIRECT_CREDIT_PURCHASE === "true";
}
