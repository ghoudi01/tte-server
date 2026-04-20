import { pgTable, text, integer, timestamp, boolean, uuid, decimal, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums for status and source
export const orderStatusEnum = pgEnum('order_status', ['pending', 'verified', 'failed', 'cancelled', 'refunded']);
export const sourceTypeEnum = pgEnum('source_type', ['woocommerce', 'shopify', 'facebook', 'instagram', 'chrome_extension', 'manual', 'whatsapp', 'api']);
export const verificationResultEnum = pgEnum('verification_result', ['success', 'failed', 'warning', 'pending']);

// Users table with points system
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  fullName: text('full_name').notNull(),
  totalPoints: integer('total_points').default(0).notNull(),
  tier: text('tier').default('bronze').notNull(), // bronze, silver, gold, platinum
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Orders table - Central hub for all orders
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  
  // Order Details
  orderId: text('order_id').notNull(), // External ID from platform
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email'),
  customerPhone: text('customer_phone').notNull(),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('TND').notNull(),
  
  // Source Tracking
  sourceType: sourceTypeEnum('source_type').notNull(),
  sourcePlatform: text('source_platform'), // e.g., "MyStore", "Page Name"
  pluginId: text('plugin_id'), // Specific plugin instance ID
  
  // Verification Status
  status: orderStatusEnum('status').default('pending').notNull(),
  verificationResult: verificationResultEnum('verification_result').default('pending'),
  fraudScore: integer('fraud_score').default(0), // 0-100
  riskLevel: text('risk_level').default('unknown'), // low, medium, high
  
  // Addresses
  shippingAddress: jsonb('shipping_address'),
  billingAddress: jsonb('billing_address'),
  
  // Items
  items: jsonb('items').notNull(), // Array of products
  
  // Metadata
  metadata: jsonb('metadata').default({}),
  notes: text('notes'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Order Verification Logs (Detailed history per order)
export const orderVerificationLogs = pgTable('order_verification_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  
  checkType: text('check_type').notNull(), // address, phone, pattern, ai_analysis
  result: verificationResultEnum('result').notNull(),
  score: integer('score'),
  message: text('message').notNull(),
  details: jsonb('details'), // Raw data from plugin/API
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Points History Ledger
export const pointsHistory = pgTable('points_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  orderId: uuid('order_id').references(() => orders.id),
  
  actionType: text('action_type').notNull(), // order_verified, feedback_submitted, manual_adjustment
  pointsAmount: integer('points_amount').notNull(), // Can be negative for penalties
  balanceAfter: integer('balance_after').notNull(),
  
  description: text('description').notNull(),
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Feedbacks table
export const feedbacks = pgTable('feedbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  
  rating: integer('rating').notNull(), // 1-5
  comment: text('comment'),
  isVerifiedPurchase: boolean('is_verified_purchase').default(true),
  
  // Points awarded for this feedback
  pointsAwarded: integer('points_awarded').default(0),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  pointsHistory: many(pointsHistory),
  feedbacks: many(feedbacks),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  verificationLogs: many(orderVerificationLogs),
  feedbacks: many(feedbacks),
}));

export const pointsHistoryRelations = relations(pointsHistory, ({ one }) => ({
  user: one(users, { fields: [pointsHistory.userId], references: [users.id] }),
  order: one(orders, { fields: [pointsHistory.orderId], references: [orders.id] }),
}));

export const feedbacksRelations = relations(feedbacks, ({ one }) => ({
  order: one(orders, { fields: [feedbacks.orderId], references: [orders.id] }),
  user: one(users, { fields: [feedbacks.userId], references: [users.id] }),
}));
