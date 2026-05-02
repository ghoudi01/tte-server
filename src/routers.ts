import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME, ONE_YEAR_MS, UNAUTHED_ERR_MSG } from "../shared/const";
import { CREDITS, CREDIT_PACK_PRICE_MILLIMES, CREDIT_PACK_TOTALS } from "../shared/credits";
import { createHash, randomUUID } from "node:crypto";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "./trpc";
import {
  adjustMerchantCredits,
  createMerchant,
  createMerchantReport,
  createOrder,
  createSessionForUser,
  createSupportTicket,
  createUser,
  creditAggregatesForMerchant,
  deleteSessionById,
  findRecentVerificationSamePhone,
  getMerchantByReferralCode,
  getMerchantByUserId,
  getMerchantReportStats,
  getUserByEmail,
  insertPhoneVerificationLog,
  installPluginForMerchant,
  listCreditTransactions,
  listMerchantReports,
  listPhoneVerificationLogs,
  listPluginRows,
  listReferralSummary,
  listOrdersByMerchant,
  recordReferralSignup,
  confirmEmailByToken,
  countUnreadNotifications,
  createPaymentOrder,
  createSmsOtpChallenge,
  fulfillPaymentOrderWithCredits,
  getApiUsageSummary,
  getPaymentOrderById,
  getUserById,
  getUserByPasswordResetToken,
  listLoginEvents,
  listMerchantReportsAdmin,
  listUserNotifications,
  markNotificationRead,
  recordLoginEvent,
  setEmailVerificationToken,
  setMerchantReportReview,
  setPasswordResetToken,
  updateMerchant,
  updateOrder,
  updatePaymentOrderProviderId,
  updateUserPasswordAndClearReset,
  verifySmsOtpChallenge,
} from "./store";
import { appContent, homeContent } from "./content";
import {
  evaluateAutomationDecision,
  buildWhatsAppValidationMessage,
  explainTrust,
  selectShippingCarrier,
  getGrowthTips,
} from "./ia-client";
import { d17CreatePayment } from "./payments/d17";
import {
  allowDirectCreditPurchase,
  d17Configured,
  flouciConfigured,
  getPublicApiBase,
  getPublicWebBase,
} from "./payments/env";
import { flouciGeneratePayment, flouciVerifyPayment } from "./payments/flouci";
import { isTwilioConfigured, sendSmsE164 } from "./sms/twilio";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
  path: "/",
  maxAge: ONE_YEAR_MS,
};

function buildRecentOrdersData(
  orders: { createdAt: string }[],
  days = 14
): { date: string; count: number }[] {
  const keys: Record<string, number> = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    keys[key] = 0;
  }
  for (const o of orders) {
    const day = o.createdAt.slice(0, 10);
    if (keys[day] !== undefined) keys[day]++;
  }
  return Object.entries(keys).map(([date, count]) => ({ date, count }));
}

const authRouter = router({
  /** Google OAuth start URL when env is set (same origin as API). */
  oauthLinks: publicProcedure.query(() => {
    const api = (process.env.PUBLIC_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? "4000"}`).replace(
      /\/$/,
      ""
    );
    const google =
      process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET
        ? `${api}/api/auth/google/start`
        : null;
    const facebook = null; // set env + implement /api/auth/facebook when App ID is available
    return { google, facebook };
  }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserByEmail(input.email);
      if (!user || user.password !== input.password) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }
      const session = await createSessionForUser(user);
      ctx.res.cookie(COOKIE_NAME, session.id, cookieOptions);
      const ip = ctx.req.ip || ctx.req.socket?.remoteAddress;
      const ua = ctx.req.headers["user-agent"];
      await recordLoginEvent(user.id, typeof ip === "string" ? ip : undefined, typeof ua === "string" ? ua : undefined);
      return { success: true, user: session.user };
    }),
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(6),
        referralCode: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await getUserByEmail(input.email);
      if (existing) throw new Error("Email already used");
      let referrer: Awaited<ReturnType<typeof getMerchantByReferralCode>> = null;
      if (input.referralCode?.trim()) {
        referrer = await getMerchantByReferralCode(input.referralCode.trim());
      }
      const user = await createUser({
        email: input.email,
        password: input.password,
      });
      if (referrer) {
        await recordReferralSignup(referrer.id, user.id);
      }
      const token = createHash("sha256").update(`${user.id}:${randomUUID()}`).digest("hex");
      const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await setEmailVerificationToken(user.id, token, exp);
      const link = `${getPublicWebBase()}/verify-email?token=${encodeURIComponent(token)}`;
      if (process.env.NODE_ENV !== "production") {
        console.log(`[TTE] Email verification link for ${user.email}: ${link}`);
      }
      return { id: user.id, email: user.email, verifyLinkDev: process.env.NODE_ENV !== "production" ? link : undefined };
    }),
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const u = await getUserById(ctx.user.id);
    const unread = await countUnreadNotifications(ctx.user.id);
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      role: ctx.user.role,
      emailVerified: u?.emailVerified ?? true,
      notificationsUnread: unread,
    };
  }),
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const user = await getUserByEmail(input.email);
      if (user) {
        const token = createHash("sha256").update(`${user.id}:pw:${randomUUID()}`).digest("hex");
        const exp = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await setPasswordResetToken(input.email, token, exp);
        const link = `${getPublicWebBase()}/reset-password?token=${encodeURIComponent(token)}`;
        if (process.env.NODE_ENV !== "production") {
          console.log(`[TTE] Password reset link for ${input.email}: ${link}`);
        }
      }
      return { ok: true as const };
    }),
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(10),
        newPassword: z.string().min(6),
      })
    )
    .mutation(async ({ input }) => {
      const user = await getUserByPasswordResetToken(input.token);
      if (!user) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "رابط منتهٍ أو غير صالح" });
      }
      await updateUserPasswordAndClearReset(user.id, input.newPassword);
      return { success: true as const };
    }),
  confirmEmail: publicProcedure
    .input(z.object({ token: z.string().min(10) }))
    .mutation(async ({ input }) => {
      const { ok } = await confirmEmailByToken(input.token);
      if (!ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "رابط التأكيد غير صالح" });
      }
      return { success: true as const };
    }),
  resendVerification: protectedProcedure.mutation(async ({ ctx }) => {
    const u = await getUserById(ctx.user.id);
    if (!u) throw new TRPCError({ code: "NOT_FOUND" });
    if (u.emailVerified) return { sent: false as const, reason: "already_verified" as const };
    const token = createHash("sha256").update(`${u.id}:ev:${randomUUID()}`).digest("hex");
    const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await setEmailVerificationToken(u.id, token, exp);
    const link = `${getPublicWebBase()}/verify-email?token=${encodeURIComponent(token)}`;
    if (process.env.NODE_ENV !== "production") {
      console.log(`[TTE] Resend verification for ${u.email}: ${link}`);
    }
    return { sent: true as const, verifyLinkDev: process.env.NODE_ENV !== "production" ? link : undefined };
  }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const sid = ctx.req.cookies?.[COOKIE_NAME];
    if (sid) await deleteSessionById(sid);
    ctx.res.clearCookie(COOKIE_NAME, { path: "/" });
    return { success: true };
  }),
});

const merchantRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => await getMerchantByUserId(ctx.user.id)),
  create: protectedProcedure
    .input(
      z.object({
        businessName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().min(1),
        city: z.string().optional(),
        address: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (await getMerchantByUserId(ctx.user.id)) throw new Error("Merchant already exists");
      return await createMerchant({
        userId: ctx.user.id,
        businessName: input.businessName,
        email: input.email,
        phone: input.phone,
        city: input.city,
        address: input.address,
        apiKey: `tte_${Math.random().toString(36).slice(2)}`,
        status: "active",
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        businessName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        city: z.string().optional(),
        address: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new Error("Merchant not found");
      return await updateMerchant(merchant.id, input);
    }),
  regenerateApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new Error("Merchant not found");
    return await updateMerchant(merchant.id, { apiKey: `tte_${Math.random().toString(36).slice(2)}` });
  }),
  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new Error(UNAUTHED_ERR_MSG);
    const merchantOrders = await listOrdersByMerchant(merchant.id);
    const reportStats = await getMerchantReportStats(merchant.id);
    const creditAgg = await creditAggregatesForMerchant(merchant.id);
    const recentOrdersData = buildRecentOrdersData(merchantOrders);
    return {
      merchant,
      orders: merchantOrders.slice(-10).reverse(),
      analytics: {
        totalOrders: merchantOrders.length,
        successfulOrders: merchantOrders.filter(o => o.status === "delivered").length,
        successRate: merchantOrders.length
          ? Math.round((merchantOrders.filter(o => o.status === "delivered").length / merchantOrders.length) * 100)
          : 0,
        rtoRate: merchant.rtoRate,
        recentOrdersData,
        regionalDistribution: [],
        monthlyGrowth: 0,
        pointsEarned: creditAgg.earned,
        pointsSpent: creditAgg.spent,
        creditsBalance: creditAgg.balance,
        reportsTotal: reportStats.total,
        reportsAccepted: reportStats.accepted,
        reportsPending: reportStats.pending,
        reportsRejected: reportStats.rejected,
      },
    };
  }),
  apiUsage: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
    }
    return getApiUsageSummary(merchant.id);
  }),
  loginHistory: protectedProcedure.query(async ({ ctx }) => listLoginEvents(ctx.user.id)),
});

const ordersRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) return [];
      let data = await listOrdersByMerchant(merchant.id);
      if (input?.status) data = data.filter(o => o.status === input.status);
      if (input?.search) data = data.filter(o => o.customerName.includes(input.search || ""));
      return data;
    }),
  create: protectedProcedure
    .input(
      z.object({
        customerName: z.string().min(1),
        phoneNumber: z.string().min(1),
        city: z.string().optional(),
        orderAmount: z.number().nonnegative(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new Error("Merchant not found");
      return await createOrder({
        merchantId: merchant.id,
        customerName: input.customerName,
        phoneNumber: input.phoneNumber,
        city: input.city,
        orderAmount: input.orderAmount,
        status: "pending",
        verificationStatus: "pending",
      });
    }),
  updateStatus: protectedProcedure
    .input(z.object({ orderId: z.string(), status: z.string() }))
    .mutation(async ({ input }) => await updateOrder(input.orderId, { status: input.status })),
});

const phoneVerificationRouter = router({
  /** Preview trust score without spending credits (admin/lab only — dashboard uses verifyPhone). */
  check: protectedProcedure
    .input(z.object({ phoneNumber: z.string().min(1) }))
    .query(async ({ input }) => {
      const score = await evaluateAutomationDecision({
        phoneNumber: input.phoneNumber,
        amount: 0,
        trustThresholdForDeposit: 50,
        autoShippingSelectionEnabled: true,
        defaultShippingCompany: "Rapid-Poste",
        shippingPartners: [{ name: "Rapid-Poste", focus: "national", status: "available" }],
      });
      return {
        phoneNumber: input.phoneNumber,
        trustScore: score.trustScore,
        isVerified: score.trustScore >= 60,
        rtoCount: 0,
        successfulOrders: 0,
        riskLevel: score.riskLevel,
      };
    }),
  verifyPhone: protectedProcedure
    .input(z.object({ phoneNumber: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }
      const isRefresh = await findRecentVerificationSamePhone(
        merchant.id,
        input.phoneNumber,
        24 * 60 * 60 * 1000
      );
      const cost = isRefresh ? CREDITS.REFRESH_PHONE : CREDITS.CHECK_PHONE;
      try {
        await adjustMerchantCredits(
          merchant.id,
          -cost,
          isRefresh ? "refresh_phone" : "check_phone"
        );
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "INSUFFICIENT_CREDITS") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient credits" });
        }
        throw e;
      }
      const score = await evaluateAutomationDecision({
        phoneNumber: input.phoneNumber,
        amount: 0,
        trustThresholdForDeposit: 50,
        autoShippingSelectionEnabled: true,
        defaultShippingCompany: "Rapid-Poste",
        shippingPartners: [{ name: "Rapid-Poste", focus: "national", status: "available" }],
      });
      await insertPhoneVerificationLog({
        merchantId: merchant.id,
        phoneNumber: input.phoneNumber.trim(),
        trustScore: score.trustScore,
        riskLevel: score.riskLevel,
        creditsSpent: cost,
      });
      const next = await getMerchantByUserId(ctx.user.id);
      return {
        phoneNumber: input.phoneNumber.trim(),
        trustScore: score.trustScore,
        isVerified: score.trustScore >= 60,
        rtoCount: 0,
        successfulOrders: 0,
        riskLevel: score.riskLevel,
        creditsBalance: next!.creditsBalance,
        creditsSpent: cost,
      };
    }),
  history: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) return [];
    return listPhoneVerificationLogs(merchant.id);
  }),
  smsConfigured: publicProcedure.query(() => ({ twilio: isTwilioConfigured() })),
  requestSmsOtp: protectedProcedure
    .input(z.object({ phone: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      if (!isTwilioConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "SMS غير مهيأ — أضف TWILIO_ACCOUNT_SID وTWILIO_AUTH_TOKEN وTWILIO_FROM_NUMBER",
        });
      }
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }
      let e164 = input.phone.trim();
      if (!e164.startsWith("+")) {
        const digits = e164.replace(/\D/g, "");
        e164 = digits.startsWith("216") ? `+${digits}` : `+216${digits}`;
      }
      const { plainCode } = await createSmsOtpChallenge(merchant.id, e164);
      await sendSmsE164(e164, `TTE — رمز التحقق: ${plainCode}`);
      return { sent: true as const };
    }),
  confirmSmsOtp: protectedProcedure
    .input(z.object({ phone: z.string().min(8), code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }
      let e164 = input.phone.trim();
      if (!e164.startsWith("+")) {
        const digits = e164.replace(/\D/g, "");
        e164 = digits.startsWith("216") ? `+${digits}` : `+216${digits}`;
      }
      const ok = await verifySmsOtpChallenge(merchant.id, e164, input.code);
      if (!ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "رمز غير صحيح أو منتهٍ" });
      }
      return { verified: true as const };
    }),
});

const automationRouter = router({
  getHomeContent: publicProcedure.query(() => homeContent),
  getAppContent: publicProcedure.query(() => appContent),
  getMerchantConfig: protectedProcedure.query(() => ({
    trustThresholdForDeposit: 50,
    autoShippingSelectionEnabled: true,
    defaultShippingCompany: "Rapid-Poste",
    shippingPartners: [{ name: "Rapid-Poste", focus: "national", status: "available" }],
  })),
  updateMerchantConfig: protectedProcedure
    .input(z.record(z.string(), z.any()))
    .mutation(({ input }) => ({ success: true, config: input })),
  simulateOrderDecision: protectedProcedure
    .input(
      z.object({
        phoneNumber: z.string(),
        orderAmount: z.number().nonnegative(),
        region: z.string().optional(),
      })
    )
    .query(async ({ input }) =>
      await evaluateAutomationDecision({
        phoneNumber: input.phoneNumber,
        amount: input.orderAmount,
        region: input.region,
        trustThresholdForDeposit: 50,
        autoShippingSelectionEnabled: true,
        defaultShippingCompany: "Rapid-Poste",
        shippingPartners: [{ name: "Rapid-Poste", focus: "national", status: "available" }],
      })
    ),
  buildWhatsAppMessage: protectedProcedure
    .input(z.object({ phoneNumber: z.string(), orderAmount: z.number().nonnegative() }))
    .query(async ({ input }) => ({ message: await buildWhatsAppValidationMessage(input) })),
  explainTrustScore: protectedProcedure
    .input(z.object({ trustScore: z.number(), rtoCount: z.number().optional(), successfulOrders: z.number().optional() }))
    .query(async ({ input }) => await explainTrust(input)),
  recommendShipping: protectedProcedure
    .input(
      z.object({
        trustScore: z.number(),
        region: z.string().optional(),
      })
    )
    .query(async ({ input }) => ({
      carrier: await selectShippingCarrier({
        trustScore: input.trustScore,
        region: input.region,
        availableCarriers: [{ name: "Rapid-Poste" }, { name: "Tunisia Express" }],
      }),
    })),
  getGrowthTips: protectedProcedure
    .input(
      z.object({
        totalOrders: z.number().nonnegative(),
        successfulOrders: z.number().nonnegative(),
        rtoRate: z.number().nonnegative(),
        successRate: z.number().nonnegative(),
      })
    )
    .query(async ({ input }) => await getGrowthTips(input)),
});

const PLUGIN_CATALOG = [
  { id: "shopify", nameAr: "Shopify", description: "مزامنة الطلبات والمنتجات" },
  { id: "woocommerce", nameAr: "WooCommerce", description: "وردبريس للتجارة" },
  { id: "facebook-instagram", nameAr: "فيسبوك وإنستغرام", description: "كتالوج ورسائل" },
  { id: "whatsapp-validation", nameAr: "التحقق عبر واتساب", description: "رسائل التحقق" },
] as const;

const packIdSchema = z.enum(["starter", "standard", "growth", "business"]);

const creditsRouter = router({
  /** What checkout paths are available (for Pricing UI). */
  gateways: publicProcedure.query(() => ({
    flouci: flouciConfigured(),
    d17: d17Configured(),
    directPurchase: allowDirectCreditPurchase(),
  })),

  summary: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
    }
    const history = await listCreditTransactions(merchant.id);
    return { balance: merchant.creditsBalance, history };
  }),

  startCheckout: protectedProcedure
    .input(
      z.object({
        packId: packIdSchema,
        gateway: z.enum(["flouci", "d17"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }
      const amountMillimes = CREDIT_PACK_PRICE_MILLIMES[input.packId];
      const creditsTotal = CREDIT_PACK_TOTALS[input.packId];
      if (amountMillimes == null || !creditsTotal) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown pack" });
      }
      if (input.gateway === "flouci" && !flouciConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "بوابة Flouci غير مهيأة",
        });
      }
      if (input.gateway === "d17" && !d17Configured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "بوابة D17 غير مهيأة",
        });
      }

      const trackingId = `po_${randomUUID().replace(/-/g, "")}`;
      await createPaymentOrder({
        id: trackingId,
        merchantId: merchant.id,
        userId: ctx.user.id,
        packId: input.packId,
        gateway: input.gateway,
        amountMillimes,
        creditsTotal,
      });

      const webBase = getPublicWebBase();
      const apiBase = getPublicApiBase();
      const successLink = `${webBase}/credits?payment=success&tracking=${encodeURIComponent(trackingId)}`;
      const failLink = `${webBase}/credits?payment=fail&tracking=${encodeURIComponent(trackingId)}`;
      const webhookFlouci = `${apiBase}/api/webhooks/flouci`;
      const webhookD17 = `${apiBase}/api/webhooks/d17`;
      const label = merchant.businessName || merchant.email || ctx.user.email;

      if (input.gateway === "flouci") {
        const { paymentId, link } = await flouciGeneratePayment({
          amountMillimes,
          developerTrackingId: trackingId,
          successLink,
          failLink,
          webhookUrl: webhookFlouci,
          clientLabel: label,
        });
        await updatePaymentOrderProviderId(trackingId, paymentId);
        return { checkoutUrl: link, trackingId };
      }

      const { checkoutUrl, providerReference } = await d17CreatePayment({
        amountMillimes,
        trackingId,
        successUrl: successLink,
        failUrl: failLink,
        webhookUrl: webhookD17,
        customerLabel: label,
      });
      if (providerReference) {
        await updatePaymentOrderProviderId(trackingId, providerReference);
      }
      return { checkoutUrl, trackingId };
    }),

  /** After redirect from PSP — verifies Flouci server-side and grants credits if paid. */
  pollPaymentStatus: protectedProcedure
    .input(z.object({ trackingId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const order = await getPaymentOrderById(input.trackingId);
      if (!order || order.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "طلب غير موجود" });
      }
      if (order.status === "pending" && order.gateway === "flouci" && order.providerPaymentId) {
        const v = await flouciVerifyPayment(order.providerPaymentId);
        if (
          v.ok &&
          v.developerTrackingId === order.id &&
          (v.amountMillimes == null || v.amountMillimes === order.amountMillimes)
        ) {
          await fulfillPaymentOrderWithCredits(order.id);
        }
      }
      const updated = await getPaymentOrderById(input.trackingId);
      const m = await getMerchantByUserId(ctx.user.id);
      return {
        status: updated?.status ?? "unknown",
        balance: m?.creditsBalance ?? 0,
      };
    }),

  /** Dev-only: grant credits without payment — set ALLOW_DIRECT_CREDIT_PURCHASE=true */
  purchasePack: protectedProcedure.input(packIdSchema).mutation(async ({ ctx, input }) => {
    if (!allowDirectCreditPurchase()) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "استخدم الدفع عبر Flouci أو D17 من صفحة التسعير",
      });
    }
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
    }
    const total = CREDIT_PACK_TOTALS[input];
    if (!total) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown pack" });
    }
    await adjustMerchantCredits(merchant.id, total, "purchase");
    const next = await getMerchantByUserId(ctx.user.id);
    return { balance: next!.creditsBalance };
  }),
});

const merchantReportsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) return [];
    return listMerchantReports(merchant.id);
  }),
  create: protectedProcedure
    .input(
      z.object({
        clientName: z.string().min(1),
        phone: z.string().min(1),
        orderId: z.string().min(1),
        amount: z.number().nonnegative(),
        reportKind: z.string().min(1),
        trackingNumber: z.string().optional(),
        carrier: z.string().optional(),
        weight: z.string().optional(),
        clientAddress: z.string().optional(),
        city: z.string().optional(),
        orderDate: z.string().optional(),
        productDescription: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }
      const id = await createMerchantReport(merchant.id, input);
      return { id };
    }),
});

const optionalWebsite = z
  .string()
  .max(500)
  .optional()
  .refine((s) => !s || /^https?:\/\/.+/i.test(s.trim()), {
    message: "رابط الموقع يجب أن يبدأ بـ https://",
  });

const helpDeskRouter = router({
  /** Anonymous / marketing-site contact (home page). Stored without merchant. */
  submitPublicContact: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        email: z.string().email(),
        phone: z.string().min(3).max(40),
        message: z.string().min(1).max(10_000),
        company: z.string().max(200).optional(),
        website: optionalWebsite,
        monthlyOrders: z.string().max(50).optional(),
        subject: z.string().max(120).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const meta: string[] = [];
      meta.push(`الهاتف: ${input.phone.trim()}`);
      const co = input.company?.trim();
      if (co) meta.push(`الشركة: ${co}`);
      const web = input.website?.trim();
      if (web) meta.push(`الموقع: ${web}`);
      const mo = input.monthlyOrders?.trim();
      if (mo) meta.push(`الطلبات الشهرية: ${mo}`);
      const sub = input.subject?.trim();
      const body = [input.message.trim(), "", "---", ...meta].join("\n");
      await createSupportTicket({
        merchantId: null,
        ticketType: "contact",
        name: input.name.trim(),
        email: input.email.trim(),
        message: body,
        subject: sub || undefined,
      });
      return { success: true as const };
    }),
  submitContact: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        message: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }
      await createSupportTicket({
        merchantId: merchant.id,
        ticketType: "contact",
        name: input.name,
        email: input.email,
        message: input.message,
      });
      return { success: true as const };
    }),
  submitProblem: protectedProcedure
    .input(
      z.object({
        subject: z.string().min(1),
        description: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }
      await createSupportTicket({
        merchantId: merchant.id,
        ticketType: "report",
        subject: input.subject,
        description: input.description,
      });
      return { success: true as const };
    }),
});

const referralsRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
    }
    const s = await listReferralSummary(merchant.id);
    return {
      referralCode: merchant.referralCode,
      ...s,
    };
  }),
});

const pluginIntegrationsRouter = router({
  catalog: publicProcedure.query(() => [...PLUGIN_CATALOG]),
  listInstalled: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) return [];
    return listPluginRows(merchant.id);
  }),
  install: protectedProcedure
    .input(z.object({ pluginId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }
      const known = PLUGIN_CATALOG.some(p => p.id === input.pluginId);
      if (!known) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown plugin" });
      }
      return installPluginForMerchant(merchant.id, input.pluginId);
    }),
});

const notificationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => listUserNotifications(ctx.user.id)),
  markRead: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await markNotificationRead(ctx.user.id, input.id);
      return { ok: true as const };
    }),
});

const adminRouter = router({
  listReports: adminProcedure
    .input(z.object({ status: z.enum(["pending", "accepted", "rejected"]).optional() }))
    .query(async ({ input }) =>
      listMerchantReportsAdmin(input.status ? { status: input.status } : undefined)
    ),
  setReportReview: adminProcedure
    .input(
      z.object({
        reportId: z.string().min(1),
        decision: z.enum(["accepted", "rejected"]),
      })
    )
    .mutation(async ({ input }) => {
      const r = await setMerchantReportReview(input.reportId, input.decision);
      if (!r.ok) {
        throw new TRPCError({ code: "NOT_FOUND", message: "التقرير غير موجود" });
      }
      return r;
    }),
});

export const appRouter = router({
  auth: authRouter,
  merchants: merchantRouter,
  orders: ordersRouter,
  phoneVerification: phoneVerificationRouter,
  automation: automationRouter,
  credits: creditsRouter,
  helpDesk: helpDeskRouter,
  pluginIntegrations: pluginIntegrationsRouter,
  referrals: referralsRouter,
  merchantReports: merchantReportsRouter,
  notifications: notificationsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
