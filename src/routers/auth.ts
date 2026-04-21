import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authCookie, signAuthToken } from "../modules/common/auth-session.js";
import { publicProcedure, protectedProcedure, router } from "../trpc.js";
import { services } from "../trpc/services.js";
import { rethrowAsTrpcError } from "../trpc/error-map.js";

export const authRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await services.auth.me(ctx.user!.id);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      totalPoints: user.totalPoints,
      tier: user.tier,
    };
  }),

  register: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const newUser = await services.auth.register(input);
        const token = signAuthToken({ id: newUser.id, email: newUser.email });
        return {
          user: {
            id: newUser.id,
            email: newUser.email,
            fullName: newUser.fullName,
            totalPoints: newUser.totalPoints,
            tier: newUser.tier,
          },
          token,
        };
      } catch (error) {
        rethrowAsTrpcError(error);
      }
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        const user = await services.auth.login(input);
        const token = signAuthToken({ id: user.id, email: user.email });
        const cookie = authCookie(token);
        ctx.res.cookie(cookie.name, cookie.value, cookie.options);
        return {
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            totalPoints: user.totalPoints,
            tier: user.tier,
          },
          token,
        };
      } catch (error) {
        rethrowAsTrpcError(error);
      }
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    ctx.res.clearCookie("tte_token");
    return { success: true, message: "Logged out successfully" };
  }),
});
