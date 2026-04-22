import { BadRequestException, Injectable } from "@nestjs/common";
import type { Order, SpamPhone } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class PhoneVerificationService {
  private static readonly CHECK_PHONE_COST = 5;

  constructor(private readonly prisma: PrismaService) {}

  async reportVerdict(input: {
    merchantId?: string;
    phoneNumber: string;
    verdict: "spam" | "not_spam";
    orderId?: number;
    reason?: string;
    source?: string;
  }) {
    return this.prisma.spamPhone.create({
      data: {
        merchantId: input.merchantId ?? null,
        phoneNumber: input.phoneNumber,
        verdict: input.verdict,
        orderId: input.orderId ?? null,
        reason: input.reason ?? null,
        source: input.source ?? "merchant",
      },
    });
  }

  async check(phoneNumber: string, userId?: string) {
    const merchant = userId
      ? await this.prisma.merchant.findFirst({
          where: { userId },
          select: { id: true, creditsBalance: true },
        })
      : null;

    if (merchant) {
      if (merchant.creditsBalance < PhoneVerificationService.CHECK_PHONE_COST) {
        throw new BadRequestException("Insufficient credits");
      }
      await this.prisma.merchant.update({
        where: { id: merchant.id },
        data: {
          creditsBalance: {
            decrement: PhoneVerificationService.CHECK_PHONE_COST,
          },
        },
      });
    }

    const [orders, verdictReports, updatedMerchant] = await Promise.all([
      this.prisma.order.findMany({
        where: { phoneNumber },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.spamPhone.findMany({
        where: { phoneNumber },
        orderBy: { reportedAt: "desc" },
      }),
      merchant
        ? this.prisma.merchant.findUnique({
            where: { id: merchant.id },
            select: { creditsBalance: true },
          })
        : Promise.resolve(null),
    ]);

    const successfulOrders = orders.filter((o: Order) => o.orderStatus === "delivered").length;
    const rtoCount = orders.filter((o: Order) => o.orderStatus === "returned").length;
    const spamReports = verdictReports.filter((r: SpamPhone) => r.verdict === "spam").length;
    const notSpamReports = verdictReports.filter((r: SpamPhone) => r.verdict === "not_spam").length;
    const trustScore = Math.max(
      5,
      Math.min(
        99,
        65 +
          successfulOrders * 5 -
          rtoCount * 12 -
          spamReports * 10 +
          notSpamReports * 6
      )
    );
    const riskLevel = trustScore >= 70 ? "low" : trustScore >= 40 ? "medium" : "high";
    return {
      phoneNumber,
      trustScore,
      riskLevel,
      successfulOrders,
      rtoCount,
      spamReports,
      notSpamReports,
      creditsBalance: updatedMerchant?.creditsBalance ?? null,
    };
  }
}
