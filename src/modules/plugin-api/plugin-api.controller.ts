
import { BadRequestException, Body, Controller, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { OrdersService } from "../orders/orders.service.js";
import { PhoneVerificationService } from "../phone-verification/phone-verification.service.js";
import {
  CheckOrderDto,
  CreateEnhancedOrderDto,
  CreatePluginOrderDto,
  OrderFeedbackDto,
  PhoneCheckDto,
  PluginReportDto,
  SendOtpDto,
  SpamPhoneDto,
} from "./plugin-api.dto.js";

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
  async check(@Headers("x-api-key") apiKey: string, @Body() body: PhoneCheckDto) {
    await this.requireMerchant(apiKey);
    return this.phoneVerification.check(body.phoneNumber);
  }

  @Post("phone-verification/send-otp")
  async sendOtp(@Headers("x-api-key") apiKey: string, @Body() body: SendOtpDto) {
    await this.requireMerchant(apiKey);
    return { success: true, message: `OTP sent to ${body.phoneNumber}` };
  }

  @Post("orders")
  async createOrder(@Headers("x-api-key") apiKey: string, @Body() body: CreatePluginOrderDto) {
    const merchant = await this.requireMerchant(apiKey);
    const phoneNumber = body.phoneNumber ?? body.phone;
    const orderAmount = body.orderAmount ?? body.amount;
    if (!phoneNumber) throw new BadRequestException("phoneNumber is required");
    if (orderAmount === undefined) throw new BadRequestException("orderAmount is required");

    const check = await this.phoneVerification.check(phoneNumber);
    const order = await this.orders.createFromPlugin(merchant.id, {
      phoneNumber,
      orderAmount,
      orderId: body.orderId,
      source: body.source ?? body.sourcePlatform ?? "api",
      clientName: body.clientName ?? body.customerName,
      trustScore: check.trustScore,
      riskLevel: check.riskLevel,
      verificationStatus: check.riskLevel === "high" ? "failed" : "verified",
      orderStatus: "placed",
      metadata: {
        items: body.items,
        customerEmail: body.customerEmail,
        ipAddress: body.ipAddress,
        shippingMethod: body.shippingMethod,
        shippingCost: body.shippingCost,
        platformRiskScore: body.platformRiskScore,
      },
    });
    return { success: true, order };
  }

  // Enhanced order creation with full enriched data
  @Post("orders/enhanced")
  async createEnhancedOrder(@Headers("x-api-key") apiKey: string, @Body() body: CreateEnhancedOrderDto) {
    const merchant = await this.requireMerchant(apiKey);
    
    const check = await this.phoneVerification.check(body.phoneNumber);
    
    const order = await this.orders.createFromPlugin(merchant.id, {
      phoneNumber: body.phoneNumber,
      orderAmount: body.orderAmount,
      orderId: body.orderId,
      source: body.paymentMethod,
      sourcePlatform: body.sourcePlatform ?? 'plugin',
      clientName: body.customer?.fullName,
      trustScore: check.trustScore,
      riskLevel: check.riskLevel,
      verificationStatus: check.riskLevel === "high" ? "failed" : "verified",
      orderStatus: "placed",
      metadata: {
        customer: body.customer ? {
          email: body.customer.email,
          fullName: body.customer.fullName,
          registrationDate: body.customer.registrationDate,
          totalPreviousOrders: body.customer.totalPreviousOrders,
          totalLifetimeValue: body.customer.totalLifetimeValue,
          loyaltyTier: body.customer.loyaltyTier,
          address: body.customer.address,
        } : undefined,
        items: body.items,
        paymentMethod: body.paymentMethod,
        paymentMethodRaw: body.paymentMethodRaw,
        customerEmail: body.customerEmail,
        shippingMethod: body.shippingMethod,
        shippingCost: body.shippingCost,
        ipAddress: body.ipAddress,
        userAgent: body.userAgent,
        deviceId: body.deviceId,
        checkoutSessionId: body.checkoutSessionId,
        platformRiskScore: body.platformRiskScore,
        platformFlags: body.platformFlags,
        checkoutDurationSeconds: body.checkoutDurationSeconds,
        marketingConsent: body.marketingConsent,
        timeOfDay: body.timeOfDay,
        timezone: body.timezone,
        storeCategory: body.storeCategory,
        externalOrderId: body.externalOrderId,
      },
    });
    
    return { success: true, order };
  }

  @Post("tte/check-order")
  async checkOrder(
    @Headers("x-api-key") apiKey: string,
    @Body() body: CheckOrderDto
  ) {
    await this.requireMerchant(apiKey);
    const check = await this.phoneVerification.check(body.phone);
    const action = this.mapDecisionAction(check.trustScore, body.amount);

    // Critical: never expose trust score to buyer-facing integrations.
    return { action };
  }

  @Post("tte/order-feedback")
  async addOrderFeedback(
    @Headers("x-api-key") apiKey: string,
    @Body() body: OrderFeedbackDto
  ) {
    const merchant = await this.requireMerchant(apiKey);
    const feedback = await this.orders.addFeedback(merchant.id, {
      orderId: body.orderId,
      rating: body.rating,
      comment: body.comment,
      category: body.category,
      source: body.source ?? "plugin",
    });
    return { success: true, feedback };
  }

  @Post("spam-phones")
  async spamPhone(@Headers("x-api-key") apiKey: string, @Body() body: SpamPhoneDto) {
    const merchant = await this.requireMerchant(apiKey);
    await this.phoneVerification.reportVerdict({
      merchantId: merchant.id,
      phoneNumber: body.phoneNumber,
      verdict: body.verdict === "not_spam" ? "not_spam" : "spam",
      orderId: body.orderId,
      reason: body.reason,
      source: body.source ?? "plugin",
    });
    return { success: true };
  }

  @Post("plugin/orders")
  async pluginOrders(@Headers("x-api-key") apiKey: string, @Body() body: CreatePluginOrderDto) {
    return this.createOrder(apiKey, body);
  }

  @Post("plugin/orders/enhanced")
  async pluginOrdersEnhanced(@Headers("x-api-key") apiKey: string, @Body() body: CreateEnhancedOrderDto) {
    return this.createEnhancedOrder(apiKey, body);
  }

  @Post("plugin/orders/feedback")
  async pluginOrderFeedback(@Headers("x-api-key") apiKey: string, @Body() body: OrderFeedbackDto) {
    return this.addOrderFeedback(apiKey, body);
  }

  @Post("plugin/reports")
  async pluginReports(@Headers("x-api-key") apiKey: string, @Body() body: PluginReportDto) {
    const merchant = await this.requireMerchant(apiKey);
    await this.prisma.report.create({
      data: {
        merchantId: merchant.id,
        phoneNumber: body.phoneNumber,
        reportType: body.reportType,
        clientName: body.clientName ?? undefined,
        externalOrderId: body.externalOrderId ?? undefined,
        amount: body.amount ?? undefined,
        notes: body.notes ?? undefined,
        trackingNumber: body.trackingNumber ?? undefined,
        carrier: body.carrier ?? undefined,
        weight: body.weight ?? undefined,
        clientAddress: body.clientAddress ?? undefined,
        city: body.city ?? undefined,
        orderDate: body.orderDate ? new Date(body.orderDate) : undefined,
        productDescription: body.productDescription ?? undefined,
      },
    });
    return { success: true, message: "Report created" };
  }
}

