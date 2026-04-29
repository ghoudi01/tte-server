import { randomUUID } from "node:crypto";
import { Pool } from "pg";

type User = {
  id: string;
  email: string;
  password: string;
  role: "admin" | "merchant";
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
};

type Session = {
  id: string;
  user: { id: string; email: string; role: "admin" | "merchant" };
};

type Order = {
  id: string;
  merchantId: string;
  customerName: string;
  phoneNumber: string;
  city?: string;
  orderAmount: number;
  status: string;
  verificationStatus: string;
  createdAt: string;
};

const pool = new Pool({
  connectionString:
    "postgresql://neondb_owner:npg_RoadvjhxX25f@ep-wandering-sky-amnz26sh-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false },
});

function mapMerchant(row: any): Merchant {
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
  };
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
  };
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
    `
    INSERT INTO users (id, email, password, role)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (email) DO NOTHING;
  `,
    ["u_admin", "admin@tte.tn", "admin123", "admin"]
  );
}

export async function getUserByEmail(email: string) {
  const res = await pool.query<User>(
    `SELECT id, email, password, role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  return res.rows[0] ?? null;
}

export async function createUser(input: { email: string; password: string }) {
  const user: User = {
    id: `u_${randomUUID()}`,
    email: input.email,
    password: input.password,
    role: "merchant",
  };
  await pool.query(
    `INSERT INTO users (id, email, password, role) VALUES ($1, $2, $3, $4)`,
    [user.id, user.email, user.password, user.role]
  );
  return user;
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

export async function createMerchant(input: Omit<Merchant, "id" | "totalOrders" | "successfulOrders" | "rtoRate">) {
  const id = `m_${randomUUID()}`;
  await pool.query(
    `
      INSERT INTO merchants (
        id, user_id, business_name, email, phone, city, address, api_key, status, total_orders, successful_orders, rto_rate
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,0)
    `,
    [
      id,
      input.userId,
      input.businessName,
      input.email,
      input.phone,
      input.city ?? null,
      input.address ?? null,
      input.apiKey,
      input.status,
    ]
  );
  const created = await getMerchantByUserId(input.userId);
  return created;
}

export async function updateMerchant(merchantId: string, patch: Partial<Merchant>) {
  const current = await pool.query(`SELECT * FROM merchants WHERE id = $1 LIMIT 1`, [merchantId]);
  if (!current.rows[0]) return null;
  const merged = { ...mapMerchant(current.rows[0]), ...patch };
  await pool.query(
    `
      UPDATE merchants
      SET business_name = $2, email = $3, phone = $4, city = $5, address = $6, api_key = $7,
          status = $8, total_orders = $9, successful_orders = $10, rto_rate = $11
      WHERE id = $1
    `,
    [
      merchantId,
      merged.businessName,
      merged.email,
      merged.phone,
      merged.city ?? null,
      merged.address ?? null,
      merged.apiKey,
      merged.status,
      merged.totalOrders,
      merged.successfulOrders,
      merged.rtoRate,
    ]
  );
  const res = await pool.query(`SELECT * FROM merchants WHERE id = $1`, [merchantId]);
  return res.rows[0] ? mapMerchant(res.rows[0]) : null;
}

export async function listOrdersByMerchant(merchantId: string) {
  const res = await pool.query(
    `SELECT * FROM orders WHERE merchant_id = $1 ORDER BY created_at DESC`,
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
        id, merchant_id, customer_name, phone_number, city, order_amount, status, verification_status, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
      SET customer_name = $2, phone_number = $3, city = $4, order_amount = $5, status = $6, verification_status = $7
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
    ]
  );
  const res = await pool.query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [orderId]);
  return res.rows[0] ? mapOrder(res.rows[0]) : null;
}
