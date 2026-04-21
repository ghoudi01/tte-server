import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";
import { services } from "../trpc/services.js";

export const automationRouter = router({
  getHomeContent: publicProcedure.query(() => services.automation.getHomeContent()),
  getAppContent: publicProcedure.query(() => services.automation.getAppContent()),
  getRoadmapIdeas: publicProcedure.query(() => services.automation.getRoadmapIdeas()),
  getMerchantConfig: protectedProcedure.query(({ ctx }) =>
    services.automation.getMerchantConfig(ctx.user!.id)
  ),
  updateMerchantConfig: protectedProcedure
    .input(
      z.object({
        autoValidationEnabled: z.boolean().optional(),
        whatsappValidationEnabled: z.boolean().optional(),
        autoShippingSelectionEnabled: z.boolean().optional(),
        trustThresholdForDeposit: z.number().min(10).max(90).optional(),
        defaultShippingCompany: z.string().optional(),
      })
    )
    .mutation(({ input, ctx }) => services.automation.updateMerchantConfig(ctx.user!.id, input)),
  simulateOrderDecision: protectedProcedure
    .input(z.object({ phoneNumber: z.string(), amount: z.number(), region: z.string() }))
    .query(({ input, ctx }) => services.automation.simulateOrderDecision(input, ctx.user!.id)),
  buildWhatsAppMessage: publicProcedure
    .input(z.object({ phoneNumber: z.string(), orderAmount: z.number() }))
    .query(({ input }) => services.automation.buildWhatsAppMessage(input)),
  explainTrustScore: publicProcedure
    .input(z.object({ trustScore: z.number(), rtoCount: z.number(), successfulOrders: z.number() }))
    .query(({ input }) => services.automation.explainTrustScore(input)),
  recommendShipping: publicProcedure
    .input(
      z.object({
        trustScore: z.number(),
        region: z.string(),
        availableCarriers: z.array(z.object({ name: z.string(), coverage: z.string().optional() })),
      })
    )
    .query(({ input }) => services.automation.recommendShipping(input)),
  getGrowthTips: protectedProcedure.query(() => services.automation.getGrowthTips()),
});
