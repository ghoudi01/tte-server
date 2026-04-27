import { router } from '../trpc.js';
import { ordersRouter } from './orders.js';
import { authRouter } from './auth.js';
import { merchantsRouter } from "./merchants.js";
import { phoneVerificationRouter } from "./phoneVerification.js";
import { automationRouter } from "./automation.js";
import { reportsRouter } from "./reports.js";
import { roadmapRouter } from "./roadmap.js";
import { webhooksRouter } from "./webhooks.js";

export const appRouter = router({
  orders: ordersRouter,
  auth: authRouter,
  merchants: merchantsRouter,
  phoneVerification: phoneVerificationRouter,
  automation: automationRouter,
  reports: reportsRouter,
  roadmap: roadmapRouter,
  webhooks: webhooksRouter,
});

export type AppRouter = typeof appRouter;
