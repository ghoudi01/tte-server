import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";
import { services } from "../trpc/services.js";

export const merchantsRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return services.merchants.getProfile(ctx.user!.id);
  }),
  create: protectedProcedure
    .input(
      z.object({
        businessName: z.string(),
        email: z.string().email(),
        phone: z.string(),
        city: z.string().optional(),
        address: z.string().optional(),
        productTypes: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => services.merchants.create(ctx.user!.id, input)),
  update: protectedProcedure
    .input(
      z.object({
        businessName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        city: z.string().optional(),
        address: z.string().optional(),
        productTypes: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => services.merchants.update(ctx.user!.id, input)),
  regenerateApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    return services.merchants.regenerateApiKey(ctx.user!.id);
  }),
  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await services.merchants.getDashboard(ctx.user!.id);
    } catch (error) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Merchant not found",
      });
    }
  }),
});
