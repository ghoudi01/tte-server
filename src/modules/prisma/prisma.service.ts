import { INestApplication, Injectable, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";

type User = {
  id: string;
  email: string;
  passwordHash?: string | null;
  fullName: string;
  totalPoints: number;
  tier: string;
};

type Merchant = {
  id: string;
  userId: string;
  businessName: string;
  email: string;
  phone: string;
  city?: string | null;
  address?: string | null;
  apiKey: string;
  status: string;
  creditsBalance: number;
  autoValidationEnabled: boolean;
  whatsappValidationEnabled: boolean;
  autoShippingSelectionEnabled: boolean;
  trustThresholdForDeposit: number;
  defaultShippingCompany: string;
};

type Order = {
  id: number;
  merchantId: string;
  userId?: string | null;
  externalOrderId?: string | null;
  phoneNumber: string;
  clientName?: string | null;
  orderAmount: number;
  trustScore: number;
  riskLevel: string;
  verificationStatus: string;
  orderStatus: string;
  pointsEarned: number;
  sourcePlugin?: string | null;
  metadata?: unknown;
  createdAt: Date;
};

type OrderFeedback = {
  id: number;
  orderId: number;
  merchantId: string;
  rating: number;
  comment?: string | null;
  category?: string | null;
  source: string;
  createdAt: Date;
};

@Injectable()
export class PrismaService implements OnModuleInit {
  private users: User[] = [];
  private merchants: Merchant[] = [];
  private orders: Order[] = [];
  private spamPhones: any[] = [];
  private orderFeedbacks: OrderFeedback[] = [];
  private orderSeq = 1;
  private orderFeedbackSeq = 1;

  async onModuleInit() {
    return;
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on("beforeExit", () => app.close());
  }

  user = {
    findUnique: async ({ where }: any) =>
      this.users.find(u => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
    create: async ({ data }: any) => {
      const user: User = {
        id: randomUUID(),
        email: data.email,
        fullName: data.fullName,
        passwordHash: data.passwordHash ?? null,
        totalPoints: data.totalPoints ?? 0,
        tier: data.tier ?? "bronze",
      };
      this.users.push(user);
      return user;
    },
  };

  merchant = {
    findFirst: async ({ where }: any) =>
      this.merchants.find(m => m.userId === where.userId) ?? null,
    findUnique: async ({ where }: any) =>
      this.merchants.find(m => m.apiKey === where.apiKey || m.id === where.id) ?? null,
    create: async ({ data }: any) => {
      const merchant: Merchant = {
        id: randomUUID(),
        userId: data.userId,
        businessName: data.businessName,
        email: data.email,
        phone: data.phone,
        city: data.city ?? null,
        address: data.address ?? null,
        apiKey: data.apiKey,
        status: "active",
        creditsBalance: 0,
        autoValidationEnabled: true,
        whatsappValidationEnabled: true,
        autoShippingSelectionEnabled: true,
        trustThresholdForDeposit: 40,
        defaultShippingCompany: "Rapid-Poste",
      };
      this.merchants.push(merchant);
      return merchant;
    },
    update: async ({ where, data }: any) => {
      const idx = this.merchants.findIndex(m => m.id === where.id);
      if (idx === -1) throw new Error("Merchant not found");
      this.merchants[idx] = { ...this.merchants[idx], ...data };
      return this.merchants[idx];
    },
  };

  order = {
    findFirst: async ({ where, select }: any) => {
      const row =
        this.orders.find(
          o =>
            (where?.id === undefined || o.id === where.id) &&
            (where?.merchantId === undefined || o.merchantId === where.merchantId)
        ) ?? null;
      if (!row || !select) return row;
      return Object.fromEntries(
        Object.keys(select)
          .filter(k => select[k])
          .map(k => [k, (row as any)[k]])
      );
    },
    findMany: async ({ where, orderBy, skip, take }: any) => {
      let rows = this.orders.filter(o => {
        if (where?.merchantId && o.merchantId !== where.merchantId) return false;
        if (where?.phoneNumber && o.phoneNumber !== where.phoneNumber) return false;
        if (where?.orderStatus && o.orderStatus !== where.orderStatus) return false;
        if (where?.verificationStatus && o.verificationStatus !== where.verificationStatus) return false;
        return true;
      });
      if (orderBy?.createdAt === "desc") rows = rows.sort((a, b) => b.id - a.id);
      return rows.slice(skip ?? 0, (skip ?? 0) + (take ?? rows.length));
    },
    create: async ({ data }: any) => {
      const order: Order = {
        id: this.orderSeq++,
        merchantId: data.merchantId,
        userId: data.userId ?? null,
        externalOrderId: data.externalOrderId ?? null,
        phoneNumber: data.phoneNumber,
        clientName: data.clientName ?? null,
        orderAmount: Number(data.orderAmount),
        trustScore: data.trustScore ?? 50,
        riskLevel: data.riskLevel ?? "medium",
        verificationStatus: data.verificationStatus ?? "pending",
        orderStatus: data.orderStatus ?? "placed",
        pointsEarned: data.pointsEarned ?? 0,
        sourcePlugin: data.sourcePlugin ?? null,
        metadata: data.metadata ?? null,
        createdAt: new Date(),
      };
      this.orders.push(order);
      return order;
    },
    update: async ({ where, data }: any) => {
      const idx = this.orders.findIndex(
        o => o.id === where.id && (!where.merchantId || o.merchantId === where.merchantId)
      );
      if (idx === -1) throw new Error("Order not found");
      this.orders[idx] = { ...this.orders[idx], ...data };
      return this.orders[idx];
    },
  };

  spamPhone = {
    create: async ({ data }: any) => {
      this.spamPhones.push({ id: this.spamPhones.length + 1, ...data });
      return this.spamPhones[this.spamPhones.length - 1];
    },
  };

  orderFeedback = {
    create: async ({ data }: any) => {
      const feedback: OrderFeedback = {
        id: this.orderFeedbackSeq++,
        orderId: Number(data.orderId),
        merchantId: data.merchantId,
        rating: Number(data.rating),
        comment: data.comment ?? null,
        category: data.category ?? null,
        source: data.source ?? "merchant",
        createdAt: new Date(),
      };
      this.orderFeedbacks.push(feedback);
      return feedback;
    },
    findMany: async ({ where, orderBy }: any) => {
      let rows = this.orderFeedbacks.filter(f => {
        if (where?.merchantId && f.merchantId !== where.merchantId) return false;
        if (where?.orderId && f.orderId !== where.orderId) return false;
        return true;
      });
      if (orderBy?.createdAt === "desc") {
        rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return rows;
    },
  };

  async $disconnect() {
    return;
  }
}
