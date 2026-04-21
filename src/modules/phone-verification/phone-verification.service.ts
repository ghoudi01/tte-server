import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class PhoneVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async check(phoneNumber: string) {
    const orders = await this.prisma.order.findMany({
      where: { phoneNumber },
      orderBy: { createdAt: "desc" },
    });
    const successfulOrders = orders.filter(o => o.orderStatus === "delivered").length;
    const rtoCount = orders.filter(o => o.orderStatus === "returned").length;
    const trustScore = Math.max(5, Math.min(99, 65 + successfulOrders * 5 - rtoCount * 12));
    const riskLevel = trustScore >= 70 ? "low" : trustScore >= 40 ? "medium" : "high";
    return { phoneNumber, trustScore, riskLevel, successfulOrders, rtoCount };
  }
}
