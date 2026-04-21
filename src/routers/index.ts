import { router } from '../trpc.js';
import { ordersRouter } from './orders.js';
import { authRouter } from './auth.js';
import { merchantsRouter } from "./merchants.js";
import { phoneVerificationRouter } from "./phoneVerification.js";
import { automationRouter } from "./automation.js";

export const appRouter = router({
  orders: ordersRouter,
  auth: authRouter,
  merchants: merchantsRouter,
  phoneVerification: phoneVerificationRouter,
  automation: automationRouter,
});

export type AppRouter = typeof appRouter;
