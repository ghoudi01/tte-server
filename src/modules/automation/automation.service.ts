import { Injectable } from "@nestjs/common";
import { MerchantsService } from "../merchants/merchants.service.js";
import { PhoneVerificationService } from "../phone-verification/phone-verification.service.js";

@Injectable()
export class AutomationService {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly phoneVerification: PhoneVerificationService
  ) {}

  getHomeContent() {
    return {};
  }

  getAppContent() {
    return { dashboard: { brandName: "Tunisia Trust Engine" } };
  }

  getRoadmapIdeas() {
    return [
      { id: "1", title: "Score explainability", status: "mvp" },
      { id: "2", title: "Automatic shipping policy", status: "mvp" },
    ];
  }

  async getMerchantConfig(userId: string) {
    const merchant = await this.merchants.getProfile(userId);
    if (!merchant) return null;
    return {
      autoValidationEnabled: merchant.autoValidationEnabled,
      whatsappValidationEnabled: merchant.whatsappValidationEnabled,
      autoShippingSelectionEnabled: merchant.autoShippingSelectionEnabled,
      trustThresholdForDeposit: merchant.trustThresholdForDeposit,
      defaultShippingCompany: merchant.defaultShippingCompany,
    };
  }

  async updateMerchantConfig(userId: string, input: any) {
    return this.merchants.update(userId, input);
  }

  async simulateOrderDecision(input: { phoneNumber: string; amount: number; region: string }, userId: string) {
    const check = await this.phoneVerification.check(input.phoneNumber);
    const config = (await this.getMerchantConfig(userId)) ?? {
      trustThresholdForDeposit: 40,
      defaultShippingCompany: "Rapid-Poste",
    };
    return {
      trustScore: check.trustScore,
      riskLevel: check.riskLevel,
      requireDeposit: check.trustScore < config.trustThresholdForDeposit,
      recommendedShippingCompany: config.defaultShippingCompany,
      decisionReasons: [
        `Trust score is ${check.trustScore}`,
        `Region: ${input.region}`,
      ],
    };
  }

  buildWhatsAppMessage(input: { phoneNumber: string; orderAmount: number }) {
    return `Bonjour, confirmation commande ${input.orderAmount} TND pour ${input.phoneNumber}.`;
  }

  explainTrustScore(input: { trustScore: number; rtoCount: number; successfulOrders: number }) {
    const level =
      input.trustScore >= 70 ? "high" : input.trustScore >= 40 ? "medium" : "low";
    return {
      level,
      reasons: [
        `Successful orders: ${input.successfulOrders}`,
        `RTO count: ${input.rtoCount}`,
      ],
    };
  }

  recommendShipping(input: { trustScore: number; availableCarriers: { name: string }[] }) {
    return input.availableCarriers[0]?.name ?? "Rapid-Poste";
  }

  getGrowthTips() {
    return [
      { id: "tip-1", title: "Enable auto validation", description: "Reduce manual checks", priority: "high" },
      { id: "tip-2", title: "Collect delivery feedback", description: "Improve trust score accuracy", priority: "medium" },
    ];
  }
}
