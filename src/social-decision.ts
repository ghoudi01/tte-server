import { evaluateAutomationDecision } from "./ia-client";

export type DecisionAction =
  | "APPROVE"
  | "CONFIRM"
  | "REQUIRE_DEPOSIT"
  | "VERIFY_CALL";

/** Map IA automation output to customer-facing action (no raw score exposed). */
export function mapDecisionToAction(score: {
  trustScore: number;
  riskLevel: string;
  requireDeposit: boolean;
}): DecisionAction {
  const t = score.trustScore;
  if (t >= 78 && score.riskLevel === "low" && !score.requireDeposit) {
    return "APPROVE";
  }
  if (t >= 55 && !score.requireDeposit) {
    return "CONFIRM";
  }
  if (score.requireDeposit || (t >= 35 && t < 55)) {
    return "REQUIRE_DEPOSIT";
  }
  return "VERIFY_CALL";
}

export async function evaluateSocialOrderDecision(input: {
    phoneNumber: string;
    amount: number;
    trustThresholdForDeposit?: number;
  }
): Promise<{ action: DecisionAction }> {
  const score = await evaluateAutomationDecision({
    phoneNumber: input.phoneNumber,
    amount: input.amount,
    trustThresholdForDeposit: input.trustThresholdForDeposit ?? 50,
    autoShippingSelectionEnabled: true,
    defaultShippingCompany: "Rapid-Poste",
    shippingPartners: [{ name: "Rapid-Poste", focus: "national", status: "available" }],
  });
  return { action: mapDecisionToAction(score) };
}
