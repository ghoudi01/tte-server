import { router, protectedProcedure } from '../trpc.js';
import { z } from 'zod';

export const webhooksRouter = router({
  listSubscriptions: protectedProcedure.query(() => ({ subscriptions: [] })),

  createSubscription: protectedProcedure
    .input(
      z.object({
        eventTypes: z.array(z.string()),
        url: z.string().url(),
      }),
    )
    .mutation(() => ({
      success: true,
      subscription: {
        id: 'new-sub',
        eventTypes: [],
        url: '',
        isActive: true,
        createdAt: new Date(),
      },
      message: 'Created',
    })),

  updateSubscription: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        eventTypes: z.array(z.string()).optional(),
        url: z.string().url().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(() => ({ success: true })),

  deleteSubscription: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(() => ({ success: true, deleted: true })),

  getStats: protectedProcedure.query(() => ({
    subscriptions: 0,
    activeSubscriptions: 0,
    totalDeliveries: 0,
    successRate: 0,
    recentFailures: 0,
  })),

  testWebhook: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        eventType: z.string().default('order.created'),
      }),
    )
    .mutation(() => ({
      success: true,
      destinationUrl: '',
      responseStatus: 200,
      responseStatusText: 'OK',
    })),

  getDeliveryLogs: protectedProcedure
    .input(
      z.object({
        subscriptionId: z.string().optional(),
        success: z.boolean().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      }),
    )
    .query(() => ({
      logs: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    })),
});
