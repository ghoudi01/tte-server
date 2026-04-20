import { router } from '../trpc.js';
import { ordersRouter } from './orders.js';
import { authRouter } from './auth.js';

export const appRouter = router({
  orders: ordersRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
