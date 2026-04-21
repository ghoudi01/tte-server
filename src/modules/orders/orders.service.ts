import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { MerchantsService } from "../merchants/merchants.service.js";

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService
  ) {}

  async list(userId: string, filters: any) {
    const merchant = await this.merchants.getProfile(userId);
    if (!merchant) throw new NotFoundException("Merchant not found");
    return this.prisma.order.findMany({
      where: {
        merchantId: merchant.id,
        orderStatus: filters.status,
        verificationStatus: filters.verificationStatus,
      },
      orderBy: { createdAt: "desc" },
      skip: filters.offset ?? 0,
      take: filters.limit ?? 20,
    });
  }

  async updateStatus(userId: string, input: { orderId: number; orderStatus: string }) {
    const merchant = await this.merchants.getProfile(userId);
    if (!merchant) throw new NotFoundException("Merchant not found");
    return this.prisma.order.update({
      where: { id: input.orderId, merchantId: merchant.id },
      data: { orderStatus: input.orderStatus },
    });
  }

  async createFromPlugin(merchantId: string, input: any) {
    return this.prisma.order.create({
      data: {
        merchantId,
        phoneNumber: input.phoneNumber,
        orderAmount: Number(input.orderAmount),
        externalOrderId: input.orderId ?? null,
        clientName: input.clientName ?? null,
        sourcePlugin: input.source ?? null,
        trustScore: input.trustScore ?? 50,
        riskLevel: input.riskLevel ?? "medium",
        verificationStatus: input.verificationStatus ?? "pending",
        orderStatus: input.orderStatus ?? "placed",
      },
    });
  }

  async addFeedback(
    merchantId: string,
    input: { orderId: number; rating: number; comment?: string; category?: string; source?: string }
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, merchantId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    return this.prisma.orderFeedback.create({
      data: {
        orderId: input.orderId,
        merchantId,
        rating: input.rating,
        comment: input.comment ?? null,
        category: input.category ?? null,
        source: input.source ?? "merchant",
      },
    });
  }

  async listFeedback(merchantId: string, orderId: number) {
    return this.prisma.orderFeedback.findMany({
      where: { merchantId, orderId },
      orderBy: { createdAt: "desc" },
    });
  }
}
