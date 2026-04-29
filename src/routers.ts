import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS, UNAUTHED_ERR_MSG } from "../shared/const";
import { router, publicProcedure, protectedProcedure } from "./trpc";
import {
  createMerchant,
  createOrder,
  createSessionForUser,
  createUser,
  deleteSessionById,
  getMerchantByUserId,
  getUserByEmail,
  listOrdersByMerchant,
  updateMerchant,
  updateOrder,
} from "./store";
import { appContent, homeContent } from "./content";
import {
  evaluateAutomationDecision,
  buildWhatsAppValidationMessage,
  explainTrust,
  selectShippingCarrier,
  getGrowthTips,
} from "../../ia-system/src/tte";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
  path: "/",
  maxAge: ONE_YEAR_MS,
};

const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const user = getUserByEmail(input.email);
      if (!user || user.password !== input.password) {
        throw new Error("Invalid email or password");
      }
      const session = createSessionForUser(user);
      ctx.res.cookie(COOKIE_NAME, session.id, cookieOptions);
      return { success: true, user: session.user };
    }),
  register: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(6) }))
    .mutation(({ input }) => {
      const existing = getUserByEmail(input.email);
      if (existing) throw new Error("Email already used");
      const user = createUser(input);
      return { id: user.id, email: user.email };
    }),
  me: publicProcedure.query(({ ctx }) => ctx.user),
  logout: publicProcedure.mutation(({ ctx }) => {
    const sid = ctx.req.cookies?.[COOKIE_NAME];
    if (sid) deleteSessionById(sid);
    ctx.res.clearCookie(COOKIE_NAME, { path: "/" });
    return { success: true };
  }),
});

const merchantRouter = router({
  getProfile: protectedProcedure.query(({ ctx }) => getMerchantByUserId(ctx.user.id)),
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
    .mutation(({ ctx, input }) => {
      if (getMerchantByUserId(ctx.user.id)) throw new Error("Merchant already exists");
      return createMerchant({
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
    .mutation(({ ctx, input }) => {
      const merchant = getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new Error("Merchant not found");
      return updateMerchant(merchant.id, input);
    }),
  regenerateApiKey: protectedProcedure.mutation(({ ctx }) => {
    const merchant = getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new Error("Merchant not found");
    return updateMerchant(merchant.id, { apiKey: `tte_${Math.random().toString(36).slice(2)}` });
  }),
  getDashboard: protectedProcedure.query(({ ctx }) => {
    const merchant = getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new Error(UNAUTHED_ERR_MSG);
    const merchantOrders = listOrdersByMerchant(merchant.id);
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
        recentOrdersData: [],
        regionalDistribution: [],
        monthlyGrowth: 0,
      },
    };
  }),
});

const ordersRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(({ ctx, input }) => {
      const merchant = getMerchantByUserId(ctx.user.id);
      if (!merchant) return [];
      let data = listOrdersByMerchant(merchant.id);
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
    .mutation(({ ctx, input }) => {
      const merchant = getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new Error("Merchant not found");
      return createOrder({
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
    .mutation(({ input }) => updateOrder(input.orderId, { status: input.status })),
});

const phoneVerificationRouter = router({
  check: protectedProcedure
    .input(z.object({ phoneNumber: z.string().min(1) }))
    .query(({ input }) => {
      const score = evaluateAutomationDecision({
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
});

const automationRouter = router({
  getHomeContent: publicProcedure.query(() => homeContent),
  getAppContent: publicProcedure.query(() => appContent),
  getRoadmapIdeas: publicProcedure.query(() => []),
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
    .query(({ input }) =>
      evaluateAutomationDecision({
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
    .query(({ input }) => ({ message: buildWhatsAppValidationMessage(input) })),
  explainTrustScore: protectedProcedure
    .input(z.object({ trustScore: z.number(), rtoCount: z.number().optional(), successfulOrders: z.number().optional() }))
    .query(({ input }) => explainTrust(input)),
  recommendShipping: protectedProcedure
    .input(
      z.object({
        trustScore: z.number(),
        region: z.string().optional(),
      })
    )
    .query(({ input }) => ({
      carrier: selectShippingCarrier({
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
    .query(({ input }) => getGrowthTips(input)),
});

const passthrough = router({
  list: protectedProcedure.query(() => []),
  getInstalled: protectedProcedure.query(() => []),
  install: protectedProcedure.mutation(() => ({ success: true })),
});

export const appRouter = router({
  auth: authRouter,
  merchants: merchantRouter,
  orders: ordersRouter,
  phoneVerification: phoneVerificationRouter,
  automation: automationRouter,
  plugins: passthrough,
  referrals: passthrough,
  reports: passthrough,
});

export type AppRouter = typeof appRouter;
