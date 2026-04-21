import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";
import { services } from "../trpc/services.js";

export const phoneVerificationRouter = router({
  check: protectedProcedure
    .input(z.object({ phoneNumber: z.string().min(6) }))
    .query(({ input }) => services.phoneVerification.check(input.phoneNumber)),
});
