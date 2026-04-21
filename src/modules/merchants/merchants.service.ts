import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    return this.prisma.merchant.findFirst({ where: { userId } });
  }

  async create(userId: string, input: any) {
    return this.prisma.merchant.create({
      data: {
        userId,
        businessName: input.businessName,
        email: input.email,
        phone: input.phone,
        city: input.city ?? null,
        address: input.address ?? null,
        productTypes: input.productTypes ?? [],
        apiKey: `tte_${randomUUID().replace(/-/g, "")}`,
      },
    });
  }

  async update(userId: string, input: any) {
    const merchant = await this.getProfile(userId);
    if (!merchant) throw new NotFoundException("Merchant not found");
    return this.prisma.merchant.update({
      where: { id: merchant.id },
      data: input,
    });
  }

  async regenerateApiKey(userId: string) {
    const merchant = await this.getProfile(userId);
    if (!merchant) throw new NotFoundException("Merchant not found");
    return this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { apiKey: `tte_${randomUUID().replace(/-/g, "")}` },
    });
  }

  async getDashboard(userId: string) {
    const merchant = await this.getProfile(userId);
    if (!merchant) throw new NotFoundException("Merchant not found");
    const orders = await this.prisma.order.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const totalOrders = orders.length;
    const delivered = orders.filter(o => o.orderStatus === "delivered").length;
    const returned = orders.filter(o => o.orderStatus === "returned").length;
    return {
      merchant,
      orders,
      analytics: {
        totalOrders,
        successRate: totalOrders ? (delivered / totalOrders) * 100 : 0,
        rtoRate: totalOrders ? (returned / totalOrders) * 100 : 0,
      },
    };
  }
}
