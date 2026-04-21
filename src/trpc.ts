import { initTRPC } from '@trpc/server';
import { TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { readUserFromRequest } from "./modules/common/auth-session.js";

interface Context {
  req: Request;
  res: Response;
  user?: {
    id: string;
    email: string;
    role?: string;
  } | null;
}

const t = initTRPC.context<Context>().create();

export const createContext = ({ req, res }: { req: Request; res: Response }): Context => ({
  req,
  res,
  user: readUserFromRequest(req),
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
