import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc.js";
import { services } from "../trpc/services.js";
import { rethrowAsTrpcError } from "../trpc/error-map.js";

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
    .mutation(async ({ input, ctx }) => {
      try {
        return await services.orders.updateStatus(ctx.user!.id, input);
      } catch (error) {
        rethrowAsTrpcError(error);
      }
    }),
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
      try {
        const merchant = await services.merchants.getProfile(ctx.user!.id);
        if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
        return await services.orders.addFeedback(merchant.id, input);
      } catch (error) {
        rethrowAsTrpcError(error);
      }
    }),
  feedbackByOrder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input, ctx }) => {
      try {
        const merchant = await services.merchants.getProfile(ctx.user!.id);
        if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
        return services.orders.listFeedback(merchant.id, input.orderId);
      } catch (error) {
        rethrowAsTrpcError(error);
      }
    }),
});
