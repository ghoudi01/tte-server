import { initTRPC } from '@trpc/server';

interface Context {
  user?: {
    id: string;
    email: string;
    role?: string;
  } | null;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new Error('Unauthorized');
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
