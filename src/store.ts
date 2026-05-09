import { createHash, randomInt, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { CREDITS, type CreditReason } from "../shared/credits";

type User = {
  id: string;
  email: string;
  password: string;
  role: "admin" | "merchant";
  emailVerified: boolean;
  totpEnabled: boolean;
  totpSecret: string | null;
  totpPendingSecret: string | null;
  /** From users.display_name (registration / profile). */
  displayName?: string | null;
};

type Merchant = {
  id: string;
  userId: string;
  businessName: string;
  email: string;
  phone: string;
  city?: string;
  address?: string;
  apiKey: string;
  status: "active";
  totalOrders: number;
  successfulOrders: number;
  rtoRate: number;
  creditsBalance: number;
  referralCode: string;
  /** Product categories from onboarding (JSON array in DB). */
  productCategories?: string[];
  /** Personal mobile from registration (step 1); distinct from business `phone` when company line exists. */
  contactMobile?: string;
  /** JSON-encoded automation configuration object. */
  automationConfig?: Record<string, unknown>;
};

type Session = {
  id: string;
  user: { id: string; email: string; role: "admin" | "merchant" };
};

export type Order = {
  id: string;
  merchantId: string;
  customerName: string;
  phoneNumber: string;
  city?: string;
  orderAmount: number;
  status: string;
  verificationStatus: string;
  createdAt: string;
  /** FB/IG variants, address, channel, Meta IDs — JSON-serializable. */
  metadata?: Record<string, unknown>;
  /** Optional linked product */
  productId?: string;
  productName?: string;
};

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required (Neon PostgreSQL connection string)."
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

function mapMerchant(row: any): Merchant {
  let productCategories: string[] | undefined;
  const rawPc = row.product_categories;
  if (rawPc != null && rawPc !== "") {
    try {
      const p = JSON.parse(String(rawPc));
      if (Array.isArray(p)) productCategories = p.map(String);
    } catch {
      productCategories = undefined;
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    businessName: row.business_name,
    email: row.email,
    phone: row.phone,
    city: row.city ?? undefined,
    address: row.address ?? undefined,
    apiKey: row.api_key,
    status: row.status,
    totalOrders: Number(row.total_orders ?? 0),
    successfulOrders: Number(row.successful_orders ?? 0),
    rtoRate: Number(row.rto_rate ?? 0),
    creditsBalance: Number(row.credits_balance ?? 0),
    referralCode: String(row.referral_code ?? ""),
    productCategories,
    contactMobile: row.contact_mobile != null && row.contact_mobile !== ""
      ? String(row.contact_mobile)
      : undefined,
  };
}

function parseMetadataCell(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  try {
    const p = JSON.parse(String(raw));
    return typeof p === "object" && p != null && !Array.isArray(p)
      ? (p as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function mapOrder(row: any): Order {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    customerName: row.customer_name,
    phoneNumber: row.phone_number,
    city: row.city ?? undefined,
    orderAmount: Number(row.order_amount),
    status: row.status,
    verificationStatus: row.verification_status,
    createdAt: row.created_at,
    metadata: parseMetadataCell(row.metadata),
    productId: row.product_id ?? undefined,
    productName: row.product_name ?? undefined,
  };
}

type Product = {
  id: string;
  merchantId: string;
  name: string;
  description?: string;
  price: number;
  sku?: string;
  category?: string;
  imageUrl?: string;
  stockQuantity: number;
  fbIgQuestions?: Record<string, unknown> | null;
  fbIgOptions?: Record<string, unknown> | null;
  fbIgEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapProduct(row: any): Product {
   return {
     id: row.id,
     merchantId: row.merchant_id,
     name: row.name,
     description: row.description ?? undefined,
     price: Number(row.price),
     sku: row.sku ?? undefined,
     category: row.category ?? undefined,
     imageUrl: row.image_url ?? undefined,
     stockQuantity: Number(row.stock_quantity ?? 0),
     fbIgQuestions: parseMetadataCell(row.fb_ig_questions),
     fbIgOptions: parseMetadataCell(row.fb_ig_options),
     fbIgEnabled: row.fb_ig_enabled ?? false,
     createdAt: row.created_at,
     updatedAt: row.updated_at,
   };
 }

async function backfillMerchantReferralCodes() {
  const res = await pool.query(
    `SELECT id FROM merchants WHERE referral_code IS NULL OR referral_code = ''`
  );
  for (const row of res.rows as { id: string }[]) {
    const code = `ref_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    await pool.query(`UPDATE merchants SET referral_code = $1 WHERE id = $2`, [
      code,
      row.id,
    ]);
  }
}

export async function insertCreditLedgerRow(
  merchantId: string,
  direction: "earn" | "spend",
  amount: number,
  reason: CreditReason
) {
  const id = `ct_${randomUUID()}`;
  await pool.query(
    `
      INSERT INTO credit_transactions (id, merchant_id, direction, amount, reason, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [id, merchantId, direction, amount, reason, new Date().toISOString()]
  );
}

export async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT,
      address TEXT,
      api_key TEXT NOT NULL,
      status TEXT NOT NULL,
      total_orders INTEGER NOT NULL DEFAULT 0,
      successful_orders INTEGER NOT NULL DEFAULT 0,
      rto_rate INTEGER NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      city TEXT,
      order_amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await pool.query(
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS metadata JSONB`
  );

   // Products table
   await pool.query(`
     CREATE TABLE IF NOT EXISTS products (
       id TEXT PRIMARY KEY,
       merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
       name TEXT NOT NULL,
       description TEXT,
       price INTEGER NOT NULL,
       sku TEXT,
       category TEXT,
       image_url TEXT,
       stock_quantity INTEGER NOT NULL DEFAULT 0,
       fb_ig_questions JSONB,
       fb_ig_options JSONB,
       fb_ig_enabled BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     );
   `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_merchant ON products(merchant_id)`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES products(id) ON DELETE SET NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_meta_connections (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      facebook_page_id TEXT NOT NULL UNIQUE,
      instagram_business_account_id TEXT,
      page_access_token_enc TEXT NOT NULL,
      token_expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchant_social_flows (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      flow_key TEXT NOT NULL,
      display_name TEXT NOT NULL,
      definition TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (merchant_id, flow_key)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meta_conversation_sessions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      page_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (page_id, sender_id, channel)
    );
  `);

  await pool.query(
    `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS credits_balance INTEGER NOT NULL DEFAULT 10`
  );
  await pool.query(
    `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS referral_code TEXT`
  );
  await pool.query(
    `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS product_categories TEXT`
  );
  await pool.query(
    `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS contact_mobile TEXT`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS phone_verification_logs (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      phone_number TEXT NOT NULL,
      trust_score INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      credits_spent INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
   await pool.query(`
     CREATE TABLE IF NOT EXISTS merchant_reports (
       id TEXT PRIMARY KEY,
       merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
       client_name TEXT NOT NULL,
       phone TEXT NOT NULL,
       order_id TEXT NOT NULL,
       amount INTEGER NOT NULL,
       report_kind TEXT NOT NULL,
       review_status TEXT NOT NULL DEFAULT 'pending',
       tracking_number TEXT,
       carrier TEXT,
       weight TEXT,
       client_address TEXT,
       city TEXT,
       order_date TEXT,
       product_description TEXT,
       notes TEXT,
       created_at TEXT NOT NULL
     );
   `);
   // Link reports to products (optional)
   await pool.query(`ALTER TABLE merchant_reports ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES products(id) ON DELETE SET NULL`);

   await pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      ticket_type TEXT NOT NULL,
      name TEXT,
      email TEXT,
      message TEXT,
      subject TEXT,
      description TEXT,
      created_at TEXT NOT NULL
    );
  `);
  await pool.query(
    `ALTER TABLE support_tickets ALTER COLUMN merchant_id DROP NOT NULL`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_events (
      id TEXT PRIMARY KEY,
      referrer_merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      referee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      credits_awarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plugin_installations (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (merchant_id, plugin_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pack_id TEXT NOT NULL,
      gateway TEXT NOT NULL,
      amount_millimes INTEGER NOT NULL,
      credits_total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      provider_payment_id TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER NOT NULL DEFAULT 1`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TEXT`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token TEXT`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires TEXT`
  );
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT`);
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled INTEGER NOT NULL DEFAULT 0`
  );
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_usage_events (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      route TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_otp_pending (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      merchant_id TEXT REFERENCES merchants(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plugin_webhook_events (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      plugin_id TEXT NOT NULL,
      payload_preview TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sms_send_log (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  await pool.query(`UPDATE users SET email_verified = 1 WHERE email_verified IS NULL`);

  await pool.query(
    `
    INSERT INTO users (id, email, password, role, email_verified)
    VALUES ($1, $2, $3, $4, 1)
    ON CONFLICT (email) DO NOTHING;
  `,
    ["u_admin", "admin@tte.tn", "admin123", "admin"]
  );

  await backfillMerchantReferralCodes();
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_referral_code ON merchants (referral_code)`
  );
}

function mapUserRow(row: {
  id: string;
  email: string;
  password: string;
  role: string;
  email_verified?: number | string | null;
  totp_secret?: string | null;
  totp_pending_secret?: string | null;
  totp_enabled?: number | string | null;
  display_name?: string | null;
}): User {
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    role: row.role as "admin" | "merchant",
    emailVerified: Number(row.email_verified ?? 1) === 1,
    totpEnabled: Number(row.totp_enabled ?? 0) === 1,
    totpSecret: row.totp_secret ?? null,
    totpPendingSecret: row.totp_pending_secret ?? null,
    displayName:
      row.display_name != null && String(row.display_name).trim() !== ""
        ? String(row.display_name).trim()
        : null,
  };
}

export async function getUserByEmail(email: string) {
  const res = await pool.query(
    `SELECT id, email, password, role, COALESCE(email_verified, 1) AS email_verified,
            totp_secret, totp_pending_secret, COALESCE(totp_enabled, 0) AS totp_enabled,
            display_name
     FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  const row = res.rows[0];
  return row ? mapUserRow(row as Parameters<typeof mapUserRow>[0]) : null;
}

export async function getUserById(id: string) {
  const res = await pool.query(
    `SELECT id, email, password, role, COALESCE(email_verified, 1) AS email_verified,
            totp_secret, totp_pending_secret, COALESCE(totp_enabled, 0) AS totp_enabled,
            display_name
     FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  const row = res.rows[0];
  return row ? mapUserRow(row as Parameters<typeof mapUserRow>[0]) : null;
}

export async function createUser(input: {
  email: string;
  password: string;
  displayName?: string;
}) {
  const user: User = {
    id: `u_${randomUUID()}`,
    email: input.email,
    password: input.password,
    role: "merchant",
    emailVerified: false,
    totpEnabled: false,
    totpSecret: null,
    totpPendingSecret: null,
  };
  const displayName = input.displayName?.trim() || null;
  await pool.query(
    `INSERT INTO users (id, email, password, role, email_verified, display_name) VALUES ($1, $2, $3, $4, 0, $5)`,
    [user.id, user.email, user.password, user.role, displayName]
  );
  return { ...user, displayName };
}

export async function updateUserDisplayName(userId: string, displayName: string | null) {
  await pool.query(`UPDATE users SET display_name = $2 WHERE id = $1`, [
    userId,
    displayName?.trim() || null,
  ]);
}

export async function createOAuthUser(email: string) {
  const password = `oauth_${randomUUID()}`;
  const user: User = {
    id: `u_${randomUUID()}`,
    email,
    password,
    role: "merchant",
    emailVerified: true,
    totpEnabled: false,
    totpSecret: null,
    totpPendingSecret: null,
  };
  await pool.query(
    `INSERT INTO users (id, email, password, role, email_verified) VALUES ($1, $2, $3, $4, 1)`,
    [user.id, user.email, user.password, user.role]
  );
  return { ...user, displayName: null as string | null };
}

export async function createSessionForUser(user: User) {
  const id = `s_${randomUUID()}`;
  await pool.query(`INSERT INTO sessions (id, user_id) VALUES ($1, $2)`, [id, user.id]);
  const session: Session = {
    id,
    user: { id: user.id, email: user.email, role: user.role },
  };
  return session;
}

export async function getSessionById(id: string) {
  const res = await pool.query(
    `
      SELECT s.id, u.id AS user_id, u.email, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = $1
      LIMIT 1
    `,
    [id]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    user: { id: row.user_id, email: row.email, role: row.role },
  };
}

export async function deleteSessionById(id: string) {
  await pool.query(`DELETE FROM sessions WHERE id = $1`, [id]);
}

export async function getMerchantByUserId(userId: string) {
  const res = await pool.query(`SELECT * FROM merchants WHERE user_id = $1 LIMIT 1`, [userId]);
  return res.rows[0] ? mapMerchant(res.rows[0]) : null;
}

export async function createMerchant(
  input: Omit<
    Merchant,
    "id" | "totalOrders" | "successfulOrders" | "rtoRate" | "creditsBalance" | "referralCode"
  >
) {
  const id = `m_${randomUUID()}`;
  const referralCode = `ref_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const productCategoriesJson =
    input.productCategories && input.productCategories.length > 0
      ? JSON.stringify(input.productCategories)
      : null;
  await pool.query(
    `
      INSERT INTO merchants (
        id, user_id, business_name, email, phone, contact_mobile, city, address, api_key, status,
        total_orders, successful_orders, rto_rate, credits_balance, referral_code,
        product_categories
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,0,$11,$12,$13)
    `,
    [
      id,
      input.userId,
      input.businessName,
      input.email,
      input.phone,
      input.contactMobile ?? null,
      input.city ?? null,
      input.address ?? null,
      input.apiKey,
      input.status,
      CREDITS.FREE_TRIAL,
      referralCode,
      productCategoriesJson,
    ]
  );
  await insertCreditLedgerRow(id, "earn", CREDITS.FREE_TRIAL, "free_trial");
  const created = await getMerchantByUserId(input.userId);
  return created;
}

export async function updateMerchant(merchantId: string, patch: Partial<Merchant>) {
  const current = await pool.query(`SELECT * FROM merchants WHERE id = $1 LIMIT 1`, [merchantId]);
  if (!current.rows[0]) return null;
  const merged = { ...mapMerchant(current.rows[0]), ...patch };
  const productCategoriesJson =
    merged.productCategories && merged.productCategories.length > 0
      ? JSON.stringify(merged.productCategories)
      : null;
  await pool.query(
    `
      UPDATE merchants
      SET business_name = $2, email = $3, phone = $4, contact_mobile = $5, city = $6, address = $7,
          api_key = $8, status = $9, total_orders = $10, successful_orders = $11, rto_rate = $12,
          credits_balance = $13, referral_code = $14, product_categories = $15
      WHERE id = $1
    `,
    [
      merchantId,
      merged.businessName,
      merged.email,
      merged.phone,
      merged.contactMobile ?? null,
      merged.city ?? null,
      merged.address ?? null,
      merged.apiKey,
      merged.status,
      merged.totalOrders,
      merged.successfulOrders,
      merged.rtoRate,
      merged.creditsBalance,
      merged.referralCode,
      productCategoriesJson,
    ]
  );
  const res = await pool.query(`SELECT * FROM merchants WHERE id = $1`, [merchantId]);
  return res.rows[0] ? mapMerchant(res.rows[0]) : null;
}

export async function listOrdersByMerchant(merchantId: string) {
  const res = await pool.query(
    `SELECT o.*, p.name as product_name, p.id as product_id
     FROM orders o
     LEFT JOIN products p ON o.product_id = p.id
     WHERE o.merchant_id = $1
     ORDER BY o.created_at DESC`,
    [merchantId]
  );
  return res.rows.map(mapOrder);
}

export async function createOrder(input: Omit<Order, "id" | "createdAt">) {
  const order: Order = {
    id: `o_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  await pool.query(
    `
      INSERT INTO orders (
        id, merchant_id, customer_name, phone_number, city, order_amount, status, verification_status, created_at, metadata, product_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      order.id,
      order.merchantId,
      order.customerName,
      order.phoneNumber,
      order.city ?? null,
      order.orderAmount,
      order.status,
      order.verificationStatus,
      order.createdAt,
      order.metadata ?? null,
      order.productId ?? null,
    ]
  );
  return order;
}

export async function updateOrder(orderId: string, patch: Partial<Order>) {
  const current = await pool.query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [orderId]);
  if (!current.rows[0]) return null;
  const merged = { ...mapOrder(current.rows[0]), ...patch };
  await pool.query(
    `
      UPDATE orders
      SET customer_name = $2, phone_number = $3, city = $4, order_amount = $5, status = $6, verification_status = $7,
          metadata = $8, product_id = $9
      WHERE id = $1
    `,
    [
      orderId,
      merged.customerName,
      merged.phoneNumber,
      merged.city ?? null,
      merged.orderAmount,
      merged.status,
      merged.verificationStatus,
      merged.metadata ?? null,
      merged.productId ?? null,
    ]
  );
  const res = await pool.query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [orderId]);
  return res.rows[0] ? mapOrder(res.rows[0]) : null;
}

const AUTO_REPORT_STATUSES = ["returned", "delivered"] as const;

export async function updateOrderStatus(
  orderId: string,
  newStatus: string,
  merchantId: string
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Update order status
    const cur = await client.query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [orderId]);
    if (!cur.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "not_found" } as const;
    }
    const prev = mapOrder(cur.rows[0]);

    if (prev.merchantId !== merchantId) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "forbidden" } as const;
    }

    await client.query(
      `UPDATE orders SET status = $2 WHERE id = $1`,
      [orderId, newStatus]
    );

    // 2. Auto-create report for relevant statuses
    if (AUTO_REPORT_STATUSES.includes(newStatus as typeof AUTO_REPORT_STATUSES[number])) {
      // Check for existing report (prevent duplicates)
      const existing = await client.query(
        `SELECT id FROM merchant_reports WHERE order_id = $1 LIMIT 1`,
        [orderId]
      );
      if (!existing.rows[0]) {
        // Spend credits
        const abs = CREDITS.REPORT_CREATE;
        const u = await client.query(
          `UPDATE merchants SET credits_balance = credits_balance - $1::int WHERE id = $2 AND credits_balance >= $3::int RETURNING credits_balance`,
          [abs, merchantId, abs]
        );
        if (u.rowCount === 0) {
          await client.query("ROLLBACK");
          return { ok: false, reason: "insufficient_credits" } as const;
        }

        // Record credit transaction
        const txId = `ct_${randomUUID()}`;
        await client.query(
          `INSERT INTO credit_transactions (id, merchant_id, direction, amount, reason, created_at)
           VALUES ($1, $2, 'spend', $3, 'report_create', $4)`,
          [txId, merchantId, abs, new Date().toISOString()]
        );

        // Create report
        const reportKind = newStatus === "returned" ? "rto" : "delivery";
        const reportId = `rpt_${randomUUID()}`;
        await client.query(
          `INSERT INTO merchant_reports (
            id, merchant_id, client_name, phone, order_id, amount, report_kind, review_status, city, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)`,
          [
            reportId,
            merchantId,
            prev.customerName,
            prev.phoneNumber,
            orderId,
            prev.orderAmount,
            reportKind,
            prev.city ?? null,
            new Date().toISOString(),
          ]
        );
      }
    }

    await client.query("COMMIT");
    return { ok: true, reason: null } as const;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getMerchantById(merchantId: string) {
  const res = await pool.query(`SELECT * FROM merchants WHERE id = $1 LIMIT 1`, [
    merchantId,
  ]);
  return res.rows[0] ? mapMerchant(res.rows[0]) : null;
}

export async function getMerchantByReferralCode(code: string) {
  const res = await pool.query(
    `SELECT * FROM merchants WHERE LOWER(referral_code) = LOWER($1) LIMIT 1`,
    [code.trim()]
  );
  return res.rows[0] ? mapMerchant(res.rows[0]) : null;
}

export async function getMerchantByPhone(phone: string) {
  const normalized = phone.trim().replace(/^\+/, "");
  const res = await pool.query(
    `SELECT * FROM merchants WHERE REPLACE(phone, '+', '') = $1 LIMIT 1`,
    [normalized]
  );
  return res.rows[0] ? mapMerchant(res.rows[0]) : null;
}

export async function getMerchantByEmail(email: string) {
  const res = await pool.query(
    `SELECT * FROM merchants WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email.trim()]
  );
  return res.rows[0] ? mapMerchant(res.rows[0]) : null;
}

// --- Product CRUD ---

export async function getProductById(id: string): Promise<Product | null> {
  const res = await pool.query(`SELECT * FROM products WHERE id = $1 LIMIT 1`, [id]);
  return res.rows[0] ? mapProduct(res.rows[0]) : null;
}

export async function listProductsByMerchant(merchantId: string): Promise<Product[]> {
  const res = await pool.query(
    `SELECT * FROM products WHERE merchant_id = $1 ORDER BY updated_at DESC`,
    [merchantId]
  );
  return res.rows.map(mapProduct);
}

export async function insertProduct(input: Omit<Product, "id" | "createdAt" | "updatedAt">): Promise<Product> {
   const id = `p_${randomUUID()}`;
   const now = new Date().toISOString();
   await pool.query(
     `INSERT INTO products (id, merchant_id, name, description, price, sku, category, image_url, stock_quantity, fb_ig_questions, fb_ig_options, fb_ig_enabled, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
     [
       id,
       input.merchantId,
       input.name,
       input.description ?? null,
       input.price,
       input.sku ?? null,
       input.category ?? null,
       input.imageUrl ?? null,
       input.stockQuantity,
       input.fbIgQuestions ?? null,
       input.fbIgOptions ?? null,
       input.fbIgEnabled ?? false,
       now,
       now,
     ]
   );
   return { ...input, id, createdAt: now, updatedAt: now } as Product;
 }

export async function updateProduct(id: string, merchantId: string, patch: Partial<Omit<Product, "id" | "createdAt" | "updatedAt">>): Promise<Product | null> {
   // Ensure product exists and belongs to merchant
   const current = await pool.query(`SELECT * FROM products WHERE id = $1 AND merchant_id = $2 LIMIT 1`, [id, merchantId]);
   if (!current.rows[0]) return null;
   const existing = mapProduct(current.rows[0]);
   const merged = { ...existing, ...patch };
   const now = new Date().toISOString();
   await pool.query(
     `UPDATE products SET name = $1, description = $2, price = $3, sku = $4, category = $5, image_url = $6, stock_quantity = $7, fb_ig_questions = $8, fb_ig_options = $9, fb_ig_enabled = $10, updated_at = $11 WHERE id = $12`,
     [
       merged.name,
       merged.description ?? null,
       merged.price,
       merged.sku ?? null,
       merged.category ?? null,
       merged.imageUrl ?? null,
       merged.stockQuantity,
       merged.fbIgQuestions ?? null,
       merged.fbIgOptions ?? null,
       merged.fbIgEnabled ?? false,
       now,
       id,
     ]
   );
   return getProductById(id);
 }

export async function deleteProduct(id: string, merchantId: string): Promise<boolean> {
  const res = await pool.query(`DELETE FROM products WHERE id = $1 AND merchant_id = $2 RETURNING id`, [id, merchantId]);
  return res.rowCount !== null && res.rowCount > 0;
}

export async function assignOrderProduct(orderId: string, merchantId: string, productId: string | null): Promise<Order | null> {
  const res = await pool.query(
    `UPDATE orders SET product_id = $1 WHERE id = $2 AND merchant_id = $3 RETURNING *`,
    [productId ?? null, orderId, merchantId]
  );
  return res.rows[0] ? mapOrder(res.rows[0]) : null;
}

// --- Credits ---

export async function adjustMerchantCredits(
  merchantId: string,
  delta: number,
  reason: CreditReason
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const abs = Math.abs(delta);
    if (delta < 0) {
      const u = await client.query(
        `UPDATE merchants SET credits_balance = credits_balance + $1::int WHERE id = $2 AND credits_balance >= $3::int RETURNING credits_balance`,
        [delta, merchantId, abs]
      );
      if (u.rowCount === 0) {
        throw new Error("INSUFFICIENT_CREDITS");
      }
    } else {
      await client.query(
        `UPDATE merchants SET credits_balance = credits_balance + $1::int WHERE id = $2`,
        [delta, merchantId]
      );
    }
    const id = `ct_${randomUUID()}`;
    await client.query(
      `INSERT INTO credit_transactions (id, merchant_id, direction, amount, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        merchantId,
        delta < 0 ? "spend" : "earn",
        abs,
        reason,
        new Date().toISOString(),
      ]
    );
    await client.query("COMMIT");
    const m = await getMerchantById(merchantId);
    return m?.creditsBalance ?? 0;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function listCreditTransactions(merchantId: string, limit = 100) {
  const res = await pool.query(
    `SELECT id, merchant_id, direction, amount, reason, created_at FROM credit_transactions
     WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [merchantId, limit]
  );
  return res.rows.map(row => ({
    id: row.id,
    type: row.direction as "spend" | "earn",
    amount: Number(row.amount),
    reason: row.reason as CreditReason,
    date: row.created_at as string,
  }));
}

export async function insertPhoneVerificationLog(input: {
  merchantId: string;
  phoneNumber: string;
  trustScore: number;
  riskLevel: string;
  creditsSpent: number;
}) {
  const id = `pv_${randomUUID()}`;
  await pool.query(
    `INSERT INTO phone_verification_logs (id, merchant_id, phone_number, trust_score, risk_level, credits_spent, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.merchantId,
      input.phoneNumber,
      input.trustScore,
      input.riskLevel,
      input.creditsSpent,
      new Date().toISOString(),
    ]
  );
}

export async function listPhoneVerificationLogs(merchantId: string, limit = 50) {
  const res = await pool.query(
    `SELECT id, phone_number, trust_score, risk_level, credits_spent, created_at FROM phone_verification_logs
     WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [merchantId, limit]
  );
  return res.rows.map(row => ({
    id: row.id,
    phoneNumber: row.phone_number as string,
    trustScore: Number(row.trust_score),
    riskLevel: row.risk_level as string,
    creditsSpent: Number(row.credits_spent),
    date: row.created_at as string,
  }));
}

export async function findRecentVerificationSamePhone(
  merchantId: string,
  phoneNumber: string,
  withinMs: number
) {
  const normalized = phoneNumber.trim().toLowerCase();
  const cutoff = new Date(Date.now() - withinMs).toISOString();
  const res = await pool.query(
    `SELECT id FROM phone_verification_logs
     WHERE merchant_id = $1 AND LOWER(TRIM(phone_number)) = $2 AND created_at >= $3
     ORDER BY created_at DESC LIMIT 1`,
    [merchantId, normalized, cutoff]
  );
  return res.rows[0] != null;
}

export type MerchantReportRow = {
  id: string;
  merchantId: string;
  clientName: string;
  phone: string;
  orderId: string;
  amount: number;
  reportKind: string;
  reviewStatus: string;
  trackingNumber?: string;
  carrier?: string;
  weight?: string;
  clientAddress?: string;
  city?: string;
  orderDate?: string;
  productDescription?: string;
  productId?: string;
  productName?: string;
  notes?: string;
  createdAt: string;
};

export async function findReportByOrderId(orderId: string) {
  const res = await pool.query(
    `SELECT id FROM merchant_reports WHERE order_id = $1 LIMIT 1`,
    [orderId]
  );
  return res.rows[0] ? (res.rows[0] as { id: string }).id : null;
}

export async function createMerchantReport(
  merchantId: string,
  input: {
    clientName: string;
    phone: string;
    orderId: string;
    amount: number;
    reportKind: string;
    trackingNumber?: string;
    carrier?: string;
    weight?: string;
    clientAddress?: string;
    city?: string;
    orderDate?: string;
    productId?: string;
    productDescription?: string;
    notes?: string;
  }
) {
  const id = `rpt_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  // Resolve product description from product if productId provided
  let productDescription = input.productDescription;
  let productId = input.productId;
  if (productId) {
    const product = await getProductById(productId);
    if (product && product.merchantId === merchantId) {
      productDescription = product.name;
    } else {
      productId = undefined; // Invalid or unauthorized product; ignore
    }
  }

  await pool.query(
    `
      INSERT INTO merchant_reports (
        id, merchant_id, client_name, phone, order_id, amount, report_kind, review_status,
        tracking_number, carrier, weight, client_address, city, order_date, product_id, product_description, notes, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    `,
    [
      id,
      merchantId,
      input.clientName,
      input.phone,
      input.orderId,
      input.amount,
      input.reportKind,
      input.trackingNumber ?? null,
      input.carrier ?? null,
      input.weight ?? null,
      input.clientAddress ?? null,
      input.city ?? null,
      input.orderDate ?? null,
      productId ?? null,
      productDescription ?? null,
      input.notes ?? null,
      createdAt,
    ]
  );
  return id;
}

export async function listMerchantReports(merchantId: string) {
  const res = await pool.query(
    `SELECT r.*, p.name as product_name, p.id as product_id
     FROM merchant_reports r
     LEFT JOIN products p ON r.product_id = p.id
     WHERE r.merchant_id = $1
     ORDER BY r.created_at DESC`,
    [merchantId]
  );
  return res.rows.map((row): MerchantReportRow => ({
    id: row.id,
    merchantId: row.merchant_id,
    clientName: row.client_name,
    phone: row.phone,
    orderId: row.order_id,
    amount: Number(row.amount),
    reportKind: row.report_kind,
    reviewStatus: row.review_status,
    trackingNumber: row.tracking_number ?? undefined,
    carrier: row.carrier ?? undefined,
    weight: row.weight ?? undefined,
    clientAddress: row.client_address ?? undefined,
    city: row.city ?? undefined,
    orderDate: row.order_date ?? undefined,
    productDescription: row.product_description ?? undefined,
    productId: row.product_id ?? undefined,
    productName: row.product_name ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function getMerchantReportStats(merchantId: string) {
  const res = await pool.query(
    `SELECT review_status, COUNT(*)::int AS c FROM merchant_reports WHERE merchant_id = $1 GROUP BY review_status`,
    [merchantId]
  );
  let total = 0;
  let accepted = 0;
  let pending = 0;
  let rejected = 0;
  for (const row of res.rows as { review_status: string; c: number }[]) {
    total += row.c;
    if (row.review_status === "accepted") accepted += row.c;
    else if (row.review_status === "pending") pending += row.c;
    else if (row.review_status === "rejected") rejected += row.c;
  }
  return { total, accepted, pending, rejected };
}

export async function createSupportTicket(input: {
  merchantId: string | null;
  ticketType: "contact" | "report";
  name?: string;
  email?: string;
  message?: string;
  subject?: string;
  description?: string;
}) {
  const id = `tk_${randomUUID()}`;
  await pool.query(
    `
      INSERT INTO support_tickets (id, merchant_id, ticket_type, name, email, message, subject, description, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      id,
      input.merchantId,
      input.ticketType,
      input.name ?? null,
      input.email ?? null,
      input.message ?? null,
      input.subject ?? null,
      input.description ?? null,
      new Date().toISOString(),
    ]
  );
  return id;
}

export async function recordReferralSignup(referrerMerchantId: string, refereeUserId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const id = `re_${randomUUID()}`;
    const ts = new Date().toISOString();
    await client.query(
      `
        INSERT INTO referral_events (id, referrer_merchant_id, referee_user_id, event_type, credits_awarded, created_at)
        VALUES ($1, $2, $3, 'signup', $4, $5)
      `,
      [id, referrerMerchantId, refereeUserId, CREDITS.REFERRAL_SIGNUP, ts]
    );
    const u = await client.query(
      `UPDATE merchants SET credits_balance = credits_balance + $1::int WHERE id = $2 RETURNING credits_balance`,
      [CREDITS.REFERRAL_SIGNUP, referrerMerchantId]
    );
    if (u.rowCount === 0) throw new Error("Referrer not found");
    const lid = `ct_${randomUUID()}`;
    await client.query(
      `
        INSERT INTO credit_transactions (id, merchant_id, direction, amount, reason, created_at)
        VALUES ($1, $2, 'earn', $3, 'referral_signup', $4)
      `,
      [lid, referrerMerchantId, CREDITS.REFERRAL_SIGNUP, ts]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function listReferralSummary(merchantId: string) {
  const statsRes = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total_events,
        COALESCE(SUM(credits_awarded), 0)::int AS credits_from_referrals
      FROM referral_events WHERE referrer_merchant_id = $1
    `,
    [merchantId]
  );
  const signupCountRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM referral_events WHERE referrer_merchant_id = $1 AND event_type = 'signup'`,
    [merchantId]
  );
  const usersRes = await pool.query(
    `
      SELECT u.id, u.email, re.created_at AS join_date, re.credits_awarded
      FROM referral_events re
      JOIN users u ON u.id = re.referee_user_id
      WHERE re.referrer_merchant_id = $1 AND re.event_type = 'signup'
      ORDER BY re.created_at DESC
      LIMIT 50
    `,
    [merchantId]
  );
  const row = statsRes.rows[0] as { total_events: number; credits_from_referrals: number };
  const signupCount = (signupCountRes.rows[0] as { c: number }).c;
  const referredUsers = usersRes.rows.map((u: { id: string; email: string; join_date: string; credits_awarded: number }) => ({
    id: u.id,
    name: u.email.split("@")[0],
    email: u.email,
    joinDate: u.join_date.slice(0, 10),
    creditsEarned: u.credits_awarded,
  }));
  return {
    totalReferrals: row.total_events,
    signupReferrals: signupCount,
    activeUsers: signupCount,
    totalCreditsEarned: row.credits_from_referrals,
    referredUsers,
  };
}

export async function listPluginRows(merchantId: string) {
  const res = await pool.query(
    `SELECT plugin_id, created_at FROM plugin_installations WHERE merchant_id = $1 ORDER BY created_at DESC`,
    [merchantId]
  );
  return res.rows.map((row: { plugin_id: string; created_at: string }) => ({
    pluginId: row.plugin_id,
    installedAt: row.created_at,
  }));
}

export async function installPluginForMerchant(merchantId: string, pluginId: string) {
  const id = `pi_${randomUUID()}`;
  await pool.query(
    `
      INSERT INTO plugin_installations (id, merchant_id, plugin_id, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (merchant_id, plugin_id) DO NOTHING
    `,
    [id, merchantId, pluginId, new Date().toISOString()]
  );
  return { success: true };
}

export type PaymentOrderRow = {
  id: string;
  merchantId: string;
  userId: string;
  packId: string;
  gateway: string;
  amountMillimes: number;
  creditsTotal: number;
  status: string;
  providerPaymentId: string | null;
  createdAt: string;
  completedAt: string | null;
};

function mapPaymentOrder(row: any): PaymentOrderRow {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    userId: row.user_id,
    packId: row.pack_id,
    gateway: row.gateway,
    amountMillimes: Number(row.amount_millimes),
    creditsTotal: Number(row.credits_total),
    status: row.status,
    providerPaymentId: row.provider_payment_id ?? null,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null,
  };
}

export async function createPaymentOrder(input: {
  id: string;
  merchantId: string;
  userId: string;
  packId: string;
  gateway: string;
  amountMillimes: number;
  creditsTotal: number;
}) {
  const ts = new Date().toISOString();
  await pool.query(
    `
      INSERT INTO payment_orders (
        id, merchant_id, user_id, pack_id, gateway, amount_millimes, credits_total, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
    `,
    [
      input.id,
      input.merchantId,
      input.userId,
      input.packId,
      input.gateway,
      input.amountMillimes,
      input.creditsTotal,
      ts,
    ]
  );
}

export async function getPaymentOrderById(id: string) {
  const res = await pool.query(`SELECT * FROM payment_orders WHERE id = $1 LIMIT 1`, [id]);
  return res.rows[0] ? mapPaymentOrder(res.rows[0]) : null;
}

export async function updatePaymentOrderProviderId(id: string, providerPaymentId: string) {
  await pool.query(`UPDATE payment_orders SET provider_payment_id = $2 WHERE id = $1`, [
    id,
    providerPaymentId,
  ]);
}

/** Returns true if this call transitioned pending → completed (idempotent). */
export async function tryCompletePaymentOrder(id: string): Promise<boolean> {
  const ts = new Date().toISOString();
  const res = await pool.query(
    `
      UPDATE payment_orders
      SET status = 'completed', completed_at = $2
      WHERE id = $1 AND status = 'pending'
      RETURNING id
    `,
    [id, ts]
  );
  return res.rowCount !== null && res.rowCount > 0;
}

export async function markPaymentOrderFailed(id: string) {
  await pool.query(`UPDATE payment_orders SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [
    id,
  ]);
}

/**
 * Mark payment completed and grant credits in one transaction (idempotent if already completed).
 */
export async function fulfillPaymentOrderWithCredits(trackingId: string): Promise<{
  status: "granted" | "already_completed" | "not_found" | "not_pending";
}> {
  const order = await getPaymentOrderById(trackingId);
  if (!order) return { status: "not_found" };
  if (order.status === "completed") return { status: "already_completed" };
  if (order.status !== "pending") return { status: "not_pending" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await client.query(
      `
        UPDATE payment_orders
        SET status = 'completed', completed_at = $2
        WHERE id = $1 AND status = 'pending'
        RETURNING merchant_id, credits_total
      `,
      [trackingId, new Date().toISOString()]
    );
    if (u.rowCount === 0) {
      await client.query("ROLLBACK");
      const again = await getPaymentOrderById(trackingId);
      if (again?.status === "completed") return { status: "already_completed" };
      return { status: "not_pending" };
    }
    const row = u.rows[0] as { merchant_id: string; credits_total: number };
    await client.query(
      `UPDATE merchants SET credits_balance = credits_balance + $1::int WHERE id = $2`,
      [row.credits_total, row.merchant_id]
    );
    const lid = `ct_${randomUUID()}`;
    await client.query(
      `
        INSERT INTO credit_transactions (id, merchant_id, direction, amount, reason, created_at)
        VALUES ($1, $2, 'earn', $3, 'purchase', $4)
      `,
      [lid, row.merchant_id, row.credits_total, new Date().toISOString()]
    );
    await client.query("COMMIT");
    return { status: "granted" };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function creditAggregatesForMerchant(merchantId: string) {
  const res = await pool.query(
    `
      SELECT direction, COALESCE(SUM(amount), 0)::bigint AS s
      FROM credit_transactions WHERE merchant_id = $1 GROUP BY direction
    `,
    [merchantId]
  );
  let earned = 0;
  let spent = 0;
  for (const row of res.rows as { direction: string; s: string }[]) {
    const n = Number(row.s);
    if (row.direction === "earn") earned = n;
    if (row.direction === "spend") spent = n;
  }
  const m = await getMerchantById(merchantId);
  return { earned, spent, balance: m?.creditsBalance ?? 0 };
}

export async function getMerchantByApiKey(apiKey: string) {
  const res = await pool.query(`SELECT * FROM merchants WHERE api_key = $1 LIMIT 1`, [apiKey]);
  return res.rows[0] ? mapMerchant(res.rows[0]) : null;
}

export async function recordApiUsage(merchantId: string, route: string) {
  const id = `au_${randomUUID()}`;
  await pool.query(
    `INSERT INTO api_usage_events (id, merchant_id, route, created_at) VALUES ($1, $2, $3, $4)`,
    [id, merchantId, route, new Date().toISOString()]
  );
}

export async function getApiUsageSummary(merchantId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const byRoute = await pool.query(
    `SELECT route, COUNT(*)::int AS c FROM api_usage_events WHERE merchant_id = $1 AND created_at >= $2 GROUP BY route ORDER BY c DESC`,
    [merchantId, since]
  );
  const totalRow = await pool.query(
    `SELECT COUNT(*)::int AS c FROM api_usage_events WHERE merchant_id = $1 AND created_at >= $2`,
    [merchantId, since]
  );
  return {
    total: Number((totalRow.rows[0] as { c: number }).c),
    byRoute: (byRoute.rows as { route: string; c: number }[]).map(r => ({
      route: r.route,
      count: r.c,
    })),
  };
}

export async function recordLoginEvent(userId: string, ip: string | undefined, userAgent: string | undefined) {
  const id = `le_${randomUUID()}`;
  await pool.query(
    `INSERT INTO login_events (id, user_id, ip, user_agent, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, ip ?? null, userAgent ?? null, new Date().toISOString()]
  );
}

export async function listLoginEvents(userId: string, limit = 20) {
  const res = await pool.query(
    `SELECT id, ip, user_agent, created_at FROM login_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return res.rows.map((row: { id: string; ip: string | null; user_agent: string | null; created_at: string }) => ({
    id: row.id,
    ip: row.ip ?? undefined,
    userAgent: row.user_agent ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function insertUserNotification(input: {
  userId: string;
  kind: string;
  title: string;
  body?: string;
}) {
  const id = `ntf_${randomUUID()}`;
  await pool.query(
    `INSERT INTO user_notifications (id, user_id, kind, title, body, read_at, created_at) VALUES ($1, $2, $3, $4, $5, NULL, $6)`,
    [id, input.userId, input.kind, input.title, input.body ?? null, new Date().toISOString()]
  );
  return id;
}

export async function listUserNotifications(userId: string, limit = 50) {
  const res = await pool.query(
    `SELECT id, kind, title, body, read_at, created_at FROM user_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return res.rows.map(
    (row: {
      id: string;
      kind: string;
      title: string;
      body: string | null;
      read_at: string | null;
      created_at: string;
    }) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body ?? undefined,
      read: row.read_at != null,
      createdAt: row.created_at,
    })
  );
}

export async function markNotificationRead(userId: string, notificationId: string) {
  await pool.query(
    `UPDATE user_notifications SET read_at = $3 WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [notificationId, userId, new Date().toISOString()]
  );
}

export async function countUnreadNotifications(userId: string) {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS c FROM user_notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return Number((res.rows[0] as { c: number }).c);
}

export async function setPasswordResetToken(email: string, token: string, expiresIso: string) {
  await pool.query(
    `UPDATE users SET password_reset_token = $2, password_reset_expires = $3 WHERE LOWER(email) = LOWER($1)`,
    [email, token, expiresIso]
  );
}

export async function getUserByPasswordResetToken(token: string) {
  const now = new Date().toISOString();
  const res = await pool.query(
    `SELECT id, email, password, role, COALESCE(email_verified, 1) AS email_verified FROM users
     WHERE password_reset_token = $1 AND password_reset_expires > $2 LIMIT 1`,
    [token, now]
  );
  const row = res.rows[0];
  return row ? mapUserRow(row as Parameters<typeof mapUserRow>[0]) : null;
}

export async function updateUserPasswordAndClearReset(userId: string, newPassword: string) {
  await pool.query(
    `UPDATE users SET password = $2, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $1`,
    [userId, newPassword]
  );
}

export async function setEmailVerificationToken(userId: string, token: string, expiresIso: string) {
  await pool.query(
    `UPDATE users SET email_verify_token = $2, email_verify_expires = $3 WHERE id = $1`,
    [userId, token, expiresIso]
  );
}

export async function confirmEmailByToken(token: string): Promise<{ ok: boolean }> {
  const now = new Date().toISOString();
  const res = await pool.query(
    `SELECT id FROM users WHERE email_verify_token = $1 AND email_verify_expires > $2 LIMIT 1`,
    [token, now]
  );
  if (!res.rows[0]) return { ok: false };
  await pool.query(
    `UPDATE users SET email_verified = 1, email_verify_token = NULL, email_verify_expires = NULL WHERE id = $1`,
    [(res.rows[0] as { id: string }).id]
  );
  return { ok: true };
}

export type AdminMerchantReportRow = MerchantReportRow & { merchantBusinessName: string };

export async function listMerchantReportsAdmin(filter?: { status?: string }) {
  let sql = `
    SELECT r.*, m.business_name AS merchant_business_name, p.name as product_name, p.id as product_id
    FROM merchant_reports r
    JOIN merchants m ON m.id = r.merchant_id
    LEFT JOIN products p ON r.product_id = p.id
  `;
  const params: string[] = [];
  if (filter?.status) {
    sql += ` WHERE r.review_status = $1`;
    params.push(filter.status);
  }
  sql += ` ORDER BY r.created_at DESC LIMIT 300`;
  const res = await pool.query(sql, params);
  return res.rows.map((row: Record<string, unknown>): AdminMerchantReportRow => ({
    id: row.id as string,
    merchantId: row.merchant_id as string,
    clientName: row.client_name as string,
    phone: row.phone as string,
    orderId: row.order_id as string,
    amount: Number(row.amount),
    reportKind: row.report_kind as string,
    reviewStatus: row.review_status as string,
    trackingNumber: row.tracking_number ? String(row.tracking_number) : undefined,
    carrier: row.carrier ? String(row.carrier) : undefined,
    weight: row.weight ? String(row.weight) : undefined,
    clientAddress: row.client_address ? String(row.client_address) : undefined,
    city: row.city ? String(row.city) : undefined,
    orderDate: row.order_date ? String(row.order_date) : undefined,
    productDescription: row.product_description ? String(row.product_description) : undefined,
    productId: row.product_id ? String(row.product_id) : undefined,
    productName: row.product_name ? String(row.product_name) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: row.created_at as string,
    merchantBusinessName: String(row.merchant_business_name ?? ""),
  }));
}

export async function setMerchantReportReview(
  reportId: string,
  nextStatus: "accepted" | "rejected"
): Promise<{ ok: boolean; reason?: string }> {
  const cur = await pool.query(`SELECT * FROM merchant_reports WHERE id = $1 LIMIT 1`, [reportId]);
  const row = cur.rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  const prev = row.review_status as string;
  if (prev !== "pending") {
    await pool.query(`UPDATE merchant_reports SET review_status = $2 WHERE id = $1`, [
      reportId,
      nextStatus,
    ]);
    return { ok: true };
  }
  await pool.query(`UPDATE merchant_reports SET review_status = $2 WHERE id = $1`, [
    reportId,
    nextStatus,
  ]);
  if (nextStatus === "accepted") {
    await adjustMerchantCredits(
      row.merchant_id as string,
      CREDITS.REPORT_ACCEPTED,
      "report_accepted"
    );
    const mu = await pool.query(`SELECT user_id FROM merchants WHERE id = $1 LIMIT 1`, [
      row.merchant_id,
    ]);
    const uid = (mu.rows[0] as { user_id: string } | undefined)?.user_id;
    if (uid) {
      await insertUserNotification({
        userId: uid,
        kind: "report_accepted",
        title: "تم قبول التقرير",
        body: "رُفع رصيد اعتماداتك وفق سياسة التقارير المقبولة.",
      });
    }
  }
  return { ok: true };
}

function otpPepper() {
  return process.env.OTP_PEPPER || "tte_otp_dev";
}

export async function createSmsOtpChallenge(
  merchantId: string,
  phone: string
): Promise<{ plainCode: string }> {
  const plainCode = String(randomInt(100000, 999999));
  const hash = createHash("sha256")
    .update(`${phone.trim()}:${plainCode}:${otpPepper()}`)
    .digest("hex");
  const id = `otp_${randomUUID()}`;
  const exp = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await pool.query(`DELETE FROM sms_otp_pending WHERE merchant_id = $1`, [merchantId]);
  await pool.query(
    `INSERT INTO sms_otp_pending (id, phone, code_hash, expires_at, merchant_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, phone.trim(), hash, exp, merchantId, new Date().toISOString()]
  );
  return { plainCode };
}

export async function verifySmsOtpChallenge(
  merchantId: string,
  phone: string,
  code: string
): Promise<boolean> {
  const hash = createHash("sha256")
    .update(`${phone.trim()}:${code}:${otpPepper()}`)
    .digest("hex");
  const now = new Date().toISOString();
  const res = await pool.query(
    `SELECT id FROM sms_otp_pending WHERE merchant_id = $1 AND phone = $2 AND code_hash = $3 AND expires_at > $4 LIMIT 1`,
    [merchantId, phone.trim(), hash, now]
  );
  if (!res.rows[0]) return false;
  await pool.query(`DELETE FROM sms_otp_pending WHERE id = $1`, [
    (res.rows[0] as { id: string }).id,
  ]);
  return true;
}

export async function recordPluginWebhookEvent(
  merchantId: string,
  pluginId: string,
  payloadPreview: string
) {
  const id = `pwh_${randomUUID()}`;
  await pool.query(
    `INSERT INTO plugin_webhook_events (id, merchant_id, plugin_id, payload_preview, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [id, merchantId, pluginId, payloadPreview.slice(0, 2000), new Date().toISOString()]
  );
}

/** Safe listing — never exposes encrypted token. */
export type MerchantMetaConnectionSafe = {
  id: string;
  merchantId: string;
  facebookPageId: string;
  instagramBusinessAccountId?: string;
  tokenExpiresAt?: string;
  hasPageToken: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function upsertMerchantMetaConnection(input: {
  merchantId: string;
  facebookPageId: string;
  instagramBusinessAccountId?: string;
  pageAccessTokenEnc: string;
  tokenExpiresAt?: string;
}) {
  const now = new Date().toISOString();
  const existing = await getMerchantMetaConnectionByPageId(input.facebookPageId);
  if (existing) {
    await pool.query(
      `
      UPDATE merchant_meta_connections SET
        merchant_id = $2,
        instagram_business_account_id = $3,
        page_access_token_enc = $4,
        token_expires_at = $5,
        updated_at = $6
      WHERE facebook_page_id = $1
      `,
      [
        input.facebookPageId,
        input.merchantId,
        input.instagramBusinessAccountId ?? null,
        input.pageAccessTokenEnc,
        input.tokenExpiresAt ?? null,
        now,
      ]
    );
    return existing.id;
  }
  const id = `mmc_${randomUUID()}`;
  await pool.query(
    `
    INSERT INTO merchant_meta_connections (
      id, merchant_id, facebook_page_id, instagram_business_account_id,
      page_access_token_enc, token_expires_at, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [
      id,
      input.merchantId,
      input.facebookPageId,
      input.instagramBusinessAccountId ?? null,
      input.pageAccessTokenEnc,
      input.tokenExpiresAt ?? null,
      now,
      now,
    ]
  );
  return id;
}

/** Resolve Meta webhook `entry.id` (Page or Instagram business account). */
export async function getMerchantMetaConnectionByPageOrInstagramId(metaEntryId: string) {
  const res = await pool.query(
    `
    SELECT * FROM merchant_meta_connections
    WHERE facebook_page_id = $1 OR instagram_business_account_id = $1
    LIMIT 1
    `,
    [metaEntryId]
  );
  return res.rows[0] as
    | {
        id: string;
        merchant_id: string;
        facebook_page_id: string;
        instagram_business_account_id: string | null;
        page_access_token_enc: string;
        token_expires_at: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;
}

export async function getMerchantMetaConnectionByPageId(facebookPageId: string) {
  const res = await pool.query(
    `SELECT * FROM merchant_meta_connections WHERE facebook_page_id = $1 LIMIT 1`,
    [facebookPageId]
  );
  return res.rows[0] as
    | {
        id: string;
        merchant_id: string;
        facebook_page_id: string;
        instagram_business_account_id: string | null;
        page_access_token_enc: string;
        token_expires_at: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;
}

export async function listMerchantMetaConnectionsSafe(
  merchantId: string
): Promise<MerchantMetaConnectionSafe[]> {
  const res = await pool.query(
    `SELECT * FROM merchant_meta_connections WHERE merchant_id = $1 ORDER BY created_at DESC`,
    [merchantId]
  );
  return res.rows.map((row: any) => ({
    id: row.id,
    merchantId: row.merchant_id,
    facebookPageId: row.facebook_page_id,
    instagramBusinessAccountId: row.instagram_business_account_id ?? undefined,
    tokenExpiresAt: row.token_expires_at ?? undefined,
    hasPageToken: Boolean(row.page_access_token_enc),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function deleteMerchantMetaConnection(merchantId: string, connectionId: string) {
  const r = await pool.query(
    `DELETE FROM merchant_meta_connections WHERE id = $1 AND merchant_id = $2`,
    [connectionId, merchantId]
  );
  return r.rowCount !== undefined && r.rowCount > 0;
}

export type MerchantSocialFlowSafe = {
  id: string;
  merchantId: string;
  flowKey: string;
  displayName: string;
  definition: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export async function listMerchantSocialFlows(merchantId: string): Promise<MerchantSocialFlowSafe[]> {
  const res = await pool.query(
    `SELECT * FROM merchant_social_flows WHERE merchant_id = $1 ORDER BY flow_key ASC`,
    [merchantId]
  );
  return res.rows.map((row: any) => ({
    id: row.id,
    merchantId: row.merchant_id,
    flowKey: row.flow_key,
    displayName: row.display_name,
    definition: (() => {
      try {
        const d = JSON.parse(row.definition as string);
        return typeof d === "object" && d != null && !Array.isArray(d)
          ? (d as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    })(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertMerchantSocialFlow(input: {
  merchantId: string;
  flowKey: string;
  displayName: string;
  definition: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const defStr = JSON.stringify(input.definition);
  const ex = await pool.query(
    `SELECT id FROM merchant_social_flows WHERE merchant_id = $1 AND flow_key = $2 LIMIT 1`,
    [input.merchantId, input.flowKey]
  );
  if (ex.rows[0]) {
    await pool.query(
      `UPDATE merchant_social_flows SET display_name = $3, definition = $4, updated_at = $5
       WHERE merchant_id = $1 AND flow_key = $2`,
      [input.merchantId, input.flowKey, input.displayName, defStr, now]
    );
    return (ex.rows[0] as { id: string }).id;
  }
  const id = `msf_${randomUUID()}`;
  await pool.query(
    `
    INSERT INTO merchant_social_flows (id, merchant_id, flow_key, display_name, definition, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
    [id, input.merchantId, input.flowKey, input.displayName, defStr, now, now]
  );
  return id;
}

export async function deleteMerchantSocialFlow(merchantId: string, flowKey: string) {
  await pool.query(
    `DELETE FROM merchant_social_flows WHERE merchant_id = $1 AND flow_key = $2`,
    [merchantId, flowKey]
  );
}

export async function getMerchantSocialFlowByKey(
  merchantId: string,
  flowKey: string
): Promise<MerchantSocialFlowSafe | null> {
  const res = await pool.query(
    `SELECT * FROM merchant_social_flows WHERE merchant_id = $1 AND flow_key = $2 LIMIT 1`,
    [merchantId, flowKey]
  );
  const row = res.rows[0];
  if (!row) return null;
  let definition: Record<string, unknown> = {};
  try {
    const d = JSON.parse(row.definition as string);
    if (typeof d === "object" && d != null && !Array.isArray(d)) {
      definition = d as Record<string, unknown>;
    }
  } catch {
    definition = {};
  }
  return {
    id: row.id,
    merchantId: row.merchant_id,
    flowKey: row.flow_key,
    displayName: row.display_name,
    definition,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type MetaConversationSessionState = {
  phase: "idle" | "variants" | "checkout" | "done";
  flowKey: string;
  variantStepIndex: number;
  checkoutFieldIndex: number;
  variantAnswers: Record<string, string>;
  checkoutAnswers: Record<string, string>;
};

export async function getMetaConversationSession(
  pageId: string,
  senderId: string,
  channel: string
): Promise<{ merchantId: string; state: MetaConversationSessionState } | null> {
  const res = await pool.query(
    `SELECT merchant_id, state_json FROM meta_conversation_sessions
     WHERE page_id = $1 AND sender_id = $2 AND channel = $3 LIMIT 1`,
    [pageId, senderId, channel]
  );
  const row = res.rows[0] as { merchant_id: string; state_json: string } | undefined;
  if (!row) return null;
  try {
    const state = JSON.parse(row.state_json) as MetaConversationSessionState;
    return { merchantId: row.merchant_id, state };
  } catch {
    return null;
  }
}

export async function upsertMetaConversationSession(input: {
  merchantId: string;
  pageId: string;
  senderId: string;
  channel: string;
  state: MetaConversationSessionState;
}) {
  const now = new Date().toISOString();
  const existing = await pool.query(
    `SELECT id FROM meta_conversation_sessions WHERE page_id = $1 AND sender_id = $2 AND channel = $3 LIMIT 1`,
    [input.pageId, input.senderId, input.channel]
  );
  const rowId = (existing.rows[0] as { id: string } | undefined)?.id;
  if (rowId) {
    await pool.query(
      `UPDATE meta_conversation_sessions SET merchant_id = $1, state_json = $2, updated_at = $3 WHERE id = $4`,
      [input.merchantId, JSON.stringify(input.state), now, rowId]
    );
    return;
  }
  const id = `mcs_${randomUUID()}`;
  await pool.query(
    `
    INSERT INTO meta_conversation_sessions (id, merchant_id, page_id, sender_id, channel, state_json, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
    [
      id,
      input.merchantId,
      input.pageId,
      input.senderId,
      input.channel,
      JSON.stringify(input.state),
      now,
    ]
  );
}

export async function clearMetaConversationSession(
  pageId: string,
  senderId: string,
  channel: string
) {
  await pool.query(
    `DELETE FROM meta_conversation_sessions WHERE page_id = $1 AND sender_id = $2 AND channel = $3`,
    [pageId, senderId, channel]
  );
}
