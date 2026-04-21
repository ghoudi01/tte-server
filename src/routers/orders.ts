import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";
import { services } from "../trpc/services.js";

export const ordersRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        status: z.enum(["placed", "shipped", "delivered", "returned", "cancelled"]).optional(),
        verificationStatus: z.enum(["pending", "verified", "failed", "rejected"]).optional(),
      })
    )
    .query(async ({ input, ctx }) => services.orders.list(ctx.user!.id, input)),
  updateStatus: protectedProcedure
    .input(z.object({ orderId: z.number(), orderStatus: z.string() }))
    .mutation(({ input, ctx }) => services.orders.updateStatus(ctx.user!.id, input)),
  addFeedback: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        rating: z.number().min(1).max(5),
        comment: z.string().max(500).optional(),
        category: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const merchant = await services.merchants.getProfile(ctx.user!.id);
      if (!merchant) throw new Error("Merchant not found");
      return services.orders.addFeedback(merchant.id, input);
    }),
  feedbackByOrder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input, ctx }) => {
      const merchant = await services.merchants.getProfile(ctx.user!.id);
      if (!merchant) throw new Error("Merchant not found");
      return services.orders.listFeedback(merchant.id, input.orderId);
    }),
});
