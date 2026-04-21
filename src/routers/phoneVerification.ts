import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";
import { services } from "../trpc/services.js";

export const phoneVerificationRouter = router({
  check: protectedProcedure
    .input(z.object({ phoneNumber: z.string().min(6) }))
    .query(({ input }) => services.phoneVerification.check(input.phoneNumber)),
  reportVerdict: protectedProcedure
    .input(
      z.object({
        phoneNumber: z.string().min(6),
        verdict: z.enum(["spam", "not_spam"]),
        orderId: z.number().int().positive().optional(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await services.merchants.getProfile(ctx.user!.id);
      return services.phoneVerification.reportVerdict({
        merchantId: merchant?.id,
        phoneNumber: input.phoneNumber,
        verdict: input.verdict,
        orderId: input.orderId,
        reason: input.reason,
        source: "dashboard",
      });
    }),
});
