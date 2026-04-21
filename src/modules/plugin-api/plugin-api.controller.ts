import { Body, Controller, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { OrdersService } from "../orders/orders.service.js";
import { PhoneVerificationService } from "../phone-verification/phone-verification.service.js";

@Controller("api")
export class PluginApiController {
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

  @Post("phone-verification/check")
  async check(@Headers("x-api-key") apiKey: string, @Body() body: { phoneNumber: string }) {
    await this.requireMerchant(apiKey);
    return this.phoneVerification.check(body.phoneNumber);
  }

  @Post("phone-verification/send-otp")
  async sendOtp(@Headers("x-api-key") apiKey: string, @Body() body: { phoneNumber: string }) {
    await this.requireMerchant(apiKey);
    return { success: true, message: `OTP sent to ${body.phoneNumber}` };
  }

  @Post("orders")
  async createOrder(@Headers("x-api-key") apiKey: string, @Body() body: any) {
    const merchant = await this.requireMerchant(apiKey);
    const check = await this.phoneVerification.check(body.phoneNumber ?? body.phone);
    const order = await this.orders.createFromPlugin(merchant.id, {
      phoneNumber: body.phoneNumber ?? body.phone,
      orderAmount: body.orderAmount ?? body.amount,
      orderId: body.orderId,
      source: body.source ?? body.sourcePlatform ?? "api",
      clientName: body.clientName ?? body.customerName,
      trustScore: check.trustScore,
      riskLevel: check.riskLevel,
      verificationStatus: check.riskLevel === "high" ? "failed" : "verified",
      orderStatus: "placed",
    });
    return { success: true, order };
  }

  @Post("tte/check-order")
  async checkOrder(
    @Headers("x-api-key") apiKey: string,
    @Body() body: { phone: string; amount: number; name?: string; address?: string }
  ) {
    await this.requireMerchant(apiKey);
    const check = await this.phoneVerification.check(body.phone);
    const action = this.mapDecisionAction(check.trustScore, Number(body.amount || 0));

    // Critical: never expose trust score to buyer-facing integrations.
    return { action };
  }

  @Post("tte/order-feedback")
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

  @Post("spam-phones")
  async spamPhone(@Headers("x-api-key") apiKey: string, @Body() body: any) {
    const merchant = await this.requireMerchant(apiKey);
    await this.phoneVerification.reportVerdict({
      merchantId: merchant.id,
      phoneNumber: body.phoneNumber,
      verdict: body.verdict === "not_spam" ? "not_spam" : "spam",
      orderId: body.orderId ? Number(body.orderId) : undefined,
      reason: body.reason,
      source: body.source ?? "plugin",
    });
    return { success: true };
  }

  @Post("plugin/orders")
  async pluginOrders(@Headers("x-api-key") apiKey: string, @Body() body: any) {
    return this.createOrder(apiKey, body);
  }

  @Post("plugin/orders/feedback")
  async pluginOrderFeedback(@Headers("x-api-key") apiKey: string, @Body() body: any) {
    return this.addOrderFeedback(apiKey, body);
  }

  @Post("plugin/reports")
  async pluginReports(@Headers("x-api-key") apiKey: string, @Body() body: any) {
    await this.requireMerchant(apiKey);
    return { success: true, message: "Report queued", data: body };
  }
}
