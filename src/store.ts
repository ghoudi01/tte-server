import { randomUUID } from "node:crypto";

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

const users: User[] = [
  {
    id: "u_admin",
    email: "admin@tte.tn",
    password: "admin123",
    role: "admin",
  },
];

const merchants: Merchant[] = [];
const sessions = new Map<string, Session>();
const orders: Order[] = [];

export function getUserByEmail(email: string) {
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function createUser(input: { email: string; password: string }) {
  const user: User = {
    id: `u_${randomUUID()}`,
    email: input.email,
    password: input.password,
    role: "merchant",
  };
  users.push(user);
  return user;
}

export function createSessionForUser(user: User) {
  const id = `s_${randomUUID()}`;
  const session: Session = { id, user: { id: user.id, email: user.email, role: user.role } };
  sessions.set(id, session);
  return session;
}

export function getSessionById(id: string) {
  return sessions.get(id) ?? null;
}

export function deleteSessionById(id: string) {
  sessions.delete(id);
}

export function getMerchantByUserId(userId: string) {
  return merchants.find(m => m.userId === userId) ?? null;
}

export function createMerchant(input: Omit<Merchant, "id" | "totalOrders" | "successfulOrders" | "rtoRate">) {
  const merchant: Merchant = {
    id: `m_${randomUUID()}`,
    totalOrders: 0,
    successfulOrders: 0,
    rtoRate: 0,
    ...input,
  };
  merchants.push(merchant);
  return merchant;
}

export function updateMerchant(merchantId: string, patch: Partial<Merchant>) {
  const merchant = merchants.find(m => m.id === merchantId);
  if (!merchant) return null;
  Object.assign(merchant, patch);
  return merchant;
}

export function listOrdersByMerchant(merchantId: string) {
  return orders.filter(o => o.merchantId === merchantId);
}

export function createOrder(input: Omit<Order, "id" | "createdAt">) {
  const order: Order = {
    id: `o_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  orders.push(order);
  return order;
}

export function updateOrder(orderId: string, patch: Partial<Order>) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return null;
  Object.assign(order, patch);
  return order;
}
