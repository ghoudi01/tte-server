import { Body, Controller, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { OrdersService } from "../orders/orders.service.js";
import { PhoneVerificationService } from "../phone-verification/phone-verification.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("tte")
export class TteController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly phoneVerification: PhoneVerificationService
  ) {}

  private async requireMerchant(apiKey?: string) {
    if (!apiKey) throw new UnauthorizedException("Missing X-API-Key header");
    const merchant = await this.prisma.merchant.findUnique({ where: { apiKey } });
    if (!merchant) throw new UnauthorizedException("Invalid X-API-Key provided");
    return merchant;
  }

  private mapDecisionAction(
    trustScore: number,
    amount: number
  ): "APPROVE" | "CONFIRM" | "REQUIRE_DEPOSIT" | "VERIFY_CALL" {
    if (trustScore >= 80 && amount <= 300) return "APPROVE";
    if (trustScore < 35) return "VERIFY_CALL";
    if (trustScore < 55 || amount > 700) return "REQUIRE_DEPOSIT";
    return "CONFIRM";
  }

  @Post("check-order")
  async checkOrder(
    @Headers("x-api-key") apiKey: string,
    @Body() body: { phone: string; amount: number; name?: string; address?: string }
  ) {
    await this.requireMerchant(apiKey);
    const check = await this.phoneVerification.check(body.phone);
    return { action: this.mapDecisionAction(check.trustScore, Number(body.amount || 0)) };
  }

  @Post("order-feedback")
  async addOrderFeedback(
    @Headers("x-api-key") apiKey: string,
    @Body()
    body: {
      orderId: number;
      rating: number;
      comment?: string;
      category?: string;
      source?: string;
    }
  ) {
    const merchant = await this.requireMerchant(apiKey);
    const feedback = await this.orders.addFeedback(merchant.id, {
      orderId: Number(body.orderId),
      rating: Math.max(1, Math.min(5, Number(body.rating || 0))),
      comment: body.comment,
      category: body.category,
      source: body.source ?? "plugin",
    });
    return { success: true, feedback };
  }
}
