import { z } from 'zod';

// Order schemas
export const createOrderSchema = z.object({
  orderId: z.string(),
  customerName: z.string().min(2),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().min(8),
  totalAmount: z.number().positive(),
  currency: z.string().default('TND'),
  
  // Source tracking
  sourceType: z.enum(['woocommerce', 'shopify', 'facebook', 'instagram', 'chrome_extension', 'manual', 'whatsapp', 'api']),
  sourcePlatform: z.string().optional(),
  pluginId: z.string().optional(),
  
  // Addresses
  shippingAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string(),
  }),
  billingAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string(),
  }).optional(),
  
  // Items
  items: z.array(z.object({
    productId: z.string(),
    name: z.string(),
    quantity: z.number().int().positive(),
    price: z.number().positive(),
  })),
  
  // Optional fields
  notes: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'verified', 'failed', 'cancelled', 'refunded']),
  verificationResult: z.enum(['success', 'failed', 'warning', 'pending']).optional(),
  fraudScore: z.number().min(0).max(100).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  notes: z.string().optional(),
});

// Feedback schemas
export const createFeedbackSchema = z.object({
  orderId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// Points schemas
export const awardPointsSchema = z.object({
  userId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  actionType: z.enum(['order_verified', 'feedback_submitted', 'manual_adjustment', 'signup_bonus', 'referral']),
  pointsAmount: z.number().int(),
  description: z.string(),
  metadata: z.record(z.any()).optional(),
});

// Query schemas
export const getOrdersQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  sourceType: z.enum(['woocommerce', 'shopify', 'facebook', 'instagram', 'chrome_extension', 'manual', 'whatsapp', 'api']).optional(),
  status: z.enum(['pending', 'verified', 'failed', 'cancelled', 'refunded']).optional(),
  verificationResult: z.enum(['success', 'failed', 'warning', 'pending']).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['createdAt', 'totalAmount', 'fraudScore']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type AwardPointsInput = z.infer<typeof awardPointsSchema>;
export type GetOrdersQuery = z.infer<typeof getOrdersQuerySchema>;
