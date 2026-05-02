/**
 * Credits economy — aligned with web/src/credits.ts and docs/CREDITS_PAYMENT_MODEL.md
 */
export const CREDITS = {
  CHECK_PHONE: 5,
  REFRESH_PHONE: 2,
  REPORT_ACCEPTED: 2,
  REFERRAL_FIRST_CHECK: 3,
  REFERRAL_SIGNUP: 1,
  FREE_TRIAL: 10,
  LOW_BALANCE_THRESHOLD: 10,
} as const;

/** Pack id → total credits granted (including bonus) — must match web CREDIT_PACKS. */
export const CREDIT_PACK_TOTALS: Record<string, number> = {
  starter: 50 + Math.floor((50 * 10) / 100),
  standard: 150,
  growth: 400 + Math.floor((400 * 15) / 100),
  business: 1000 + Math.floor((1000 * 15) / 100),
};

/** Amount charged in millimes (1 TND = 1000 millimes) — must match web CREDIT_PACKS priceTND. */
export const CREDIT_PACK_PRICE_MILLIMES: Record<string, number> = {
  starter: 9990,
  standard: 24990,
  growth: 59990,
  business: 129990,
};

export type CreditReason =
  | "check_phone"
  | "refresh_phone"
  | "report_accepted"
  | "referral_first_check"
  | "referral_signup"
  | "purchase"
  | "free_trial"
  | "bonus";
