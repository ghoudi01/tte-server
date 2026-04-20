import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { db } from '../../database/index.js';
import { orders, users, feedbacks, pointsHistory, orderVerificationLogs } from '../schema/index.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const orderAddressSchema = z
  .object({
    city: z.string().optional(),
    street: z.string().optional(),
  })
  .passthrough()
  .optional();

const createOrderSchema = z
  .object({
    userId: z.string().optional(),
    orderId: z.string(),
    customerName: z.string(),
    customerEmail: z.string(),
    customerPhone: z.string(),
    totalAmount: z.union([z.number(), z.string()]),
    currency: z.string(),
    sourceType: z.enum([
      'woocommerce',
      'shopify',
      'facebook',
      'instagram',
      'chrome_extension',
      'manual',
      'whatsapp',
      'api',
    ]),
    sourcePlatform: z.string(),
    pluginId: z.string().nullable().optional(),
    shippingAddress: orderAddressSchema,
    billingAddress: z.unknown().optional(),
    items: z.unknown().optional(),
    metadata: z.unknown().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

const updateStatusSchema = z
  .object({
    orderId: z.string(),
  })
  .passthrough();

const submitFeedbackSchema = z.object({
  orderId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
});

export const ordersRouter = router({
  // Create a new order
  create: protectedProcedure
    .input(createOrderSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id || input.userId;
      
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User ID required' });
      }

      // Calculate fraud score using AI system
      const fraudScore = await calculateFraudScore(input);
      const riskLevel = fraudScore > 70 ? 'high' : fraudScore > 40 ? 'medium' : 'low';
      const verificationResult = fraudScore > 70 ? 'failed' : fraudScore > 40 ? 'warning' : 'success';
      const status = fraudScore > 70 ? 'failed' : 'verified';

      // Create order
      const [newOrder] = await db.insert(orders).values({
        userId,
        orderId: input.orderId,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        totalAmount: input.totalAmount.toString(),
        currency: input.currency,
        sourceType: input.sourceType,
        sourcePlatform: input.sourcePlatform,
        pluginId: input.pluginId,
        status,
        verificationResult,
        fraudScore,
        riskLevel,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress,
        items: input.items,
        metadata: input.metadata,
        notes: input.notes,
      }).returning();

      // Award points for successful order
      if (status === 'verified') {
        const basePoints = Math.floor(Number(input.totalAmount) / 10); // 1 point per 10 TND
        await awardPoints(userId, newOrder.id, 'order_verified', basePoints, `Order verified: ${input.orderId}`);
      }

      // Log verification
      await db.insert(orderVerificationLogs).values({
        orderId: newOrder.id,
        checkType: 'ai_analysis',
        result: verificationResult,
        score: fraudScore,
        message: `Automated verification completed`,
        details: { riskLevel, input },
      });

      return newOrder;
    }),

  // Get all orders with filters
  getAll: protectedProcedure
    .query(async ({ ctx }) => {
      const userOrders = await db.query.orders.findMany({
        where: ctx.user?.role === 'admin' ? undefined : eq(orders.userId, ctx.user?.id),
        orderBy: [desc(orders.createdAt)],
        with: {
          user: true,
          feedbacks: true,
          verificationLogs: {
            limit: 5,
            orderBy: [desc(orderVerificationLogs.createdAt)],
          },
        },
      });

      return userOrders;
    }),

  // Get order by ID
  getById: protectedProcedure
    .input(z.string())
    .query(async ({ input, ctx }) => {
      const order = await db.query.orders.findFirst({
        where: and(
          eq(orders.id, input),
          ctx.user?.role === 'admin' ? undefined : eq(orders.userId, ctx.user?.id)
        ),
        with: {
          user: true,
          feedbacks: true,
          verificationLogs: true,
        },
      });

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      return order;
    }),

  // Update order status
  updateStatus: protectedProcedure
    .input(updateStatusSchema)
    .mutation(async ({ input, ctx }) => {
      const { orderId, ...updates } = input;

      const [updatedOrder] = await db.update(orders)
        .set(updates)
        .where(eq(orders.id, orderId))
        .returning();

      if (!updatedOrder) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      return updatedOrder;
    }),

  // Submit feedback for an order
  submitFeedback: protectedProcedure
    .input(submitFeedbackSchema)
    .mutation(async ({ input, ctx }) => {
      const { orderId, rating, comment } = input;

      // Check if order exists and belongs to user
      const order = await db.query.orders.findFirst({
        where: and(
          eq(orders.id, orderId),
          eq(orders.userId, ctx.user?.id)
        ),
      });

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      // Check if feedback already exists
      const existingFeedback = await db.query.feedbacks.findFirst({
        where: eq(feedbacks.orderId, orderId),
      });

      if (existingFeedback) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Feedback already submitted for this order' });
      }

      // Calculate points for feedback
      let pointsAwarded = 5; // Base points for any feedback
      
      // Bonus for high ratings (4-5 stars)
      if (rating >= 4) {
        pointsAwarded += 5;
      }
      
      // Extra bonus for perfect 5-star rating
      if (rating === 5) {
        pointsAwarded += 5;
      }

      // Create feedback
      const [newFeedback] = await db.insert(feedbacks).values({
        orderId,
        userId: ctx.user!.id,
        rating,
        comment,
        isVerifiedPurchase: true,
        pointsAwarded,
      }).returning();

      // Award points
      await awardPoints(
        ctx.user!.id,
        orderId,
        'feedback_submitted',
        pointsAwarded,
        `Feedback submitted for order ${order.orderId} - Rating: ${rating}/5`
      );

      return { feedback: newFeedback, pointsAwarded };
    }),

  // Get user's points history
  getPointsHistory: protectedProcedure
    .query(async ({ ctx }) => {
      const history = await db.query.pointsHistory.findMany({
        where: eq(pointsHistory.userId, ctx.user!.id),
        orderBy: [desc(pointsHistory.createdAt)],
        limit: 50,
        with: {
          order: {
            columns: { orderId: true, totalAmount: true, status: true },
          },
        },
      });

      return history;
    }),

  // Get dashboard stats
  getDashboardStats: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user!.id;

      // Get total orders
      const totalOrders = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(eq(orders.userId, userId));

      // Get verified orders
      const verifiedOrders = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(and(
          eq(orders.userId, userId),
          eq(orders.status, 'verified')
        ));

      // Get failed orders
      const failedOrders = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(and(
          eq(orders.userId, userId),
          eq(orders.status, 'failed')
        ));

      // Get user points
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      // Get feedback count
      const feedbackCount = await db.select({ count: sql<number>`count(*)` })
        .from(feedbacks)
        .where(eq(feedbacks.userId, userId));

      return {
        totalOrders: Number(totalOrders[0]?.count || 0),
        verifiedOrders: Number(verifiedOrders[0]?.count || 0),
        failedOrders: Number(failedOrders[0]?.count || 0),
        totalPoints: user?.totalPoints || 0,
        tier: user?.tier || 'bronze',
        feedbackCount: Number(feedbackCount[0]?.count || 0),
      };
    }),
});

// Helper functions
async function calculateFraudScore(input: any): Promise<number> {
  // Simple fraud scoring algorithm (can be enhanced with AI/ML)
  let score = 0;

  // Check phone number patterns
  if (input.customerPhone && !/^\+?[0-9]{8,15}$/.test(input.customerPhone)) {
    score += 20;
  }

  // Check email domain
  if (input.customerEmail) {
    const disposableDomains = ['tempmail.com', 'throwaway.com', 'guerrillamail.com'];
    const domain = input.customerEmail.split('@')[1];
    if (disposableDomains.includes(domain)) {
      score += 30;
    }
  }

  // Check address completeness
  if (!input.shippingAddress?.city || !input.shippingAddress?.street) {
    score += 15;
  }

  // High value orders
  if (Number(input.totalAmount) > 500) {
    score += 10;
  }

  // Add some randomness for demo purposes
  score += Math.floor(Math.random() * 20);

  return Math.min(score, 100);
}

async function awardPoints(
  userId: string,
  orderId: string | undefined,
  actionType: string,
  pointsAmount: number,
  description: string
) {
  // Get current user points
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) return;

  const newBalance = user.totalPoints + pointsAmount;

  // Update user points
  await db.update(users)
    .set({ 
      totalPoints: newBalance,
      tier: calculateTier(newBalance),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // Log points history
  await db.insert(pointsHistory).values({
    userId,
    orderId: orderId || undefined,
    actionType,
    pointsAmount,
    balanceAfter: newBalance,
    description,
  });
}

function calculateTier(points: number): string {
  if (points >= 1000) return 'platinum';
  if (points >= 500) return 'gold';
  if (points >= 200) return 'silver';
  return 'bronze';
}
