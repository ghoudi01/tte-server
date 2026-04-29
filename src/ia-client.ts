type AutomationDecisionInput = {
  phoneNumber: string;
  amount: number;
  region?: string;
  trustThresholdForDeposit: number;
  autoShippingSelectionEnabled: boolean;
  defaultShippingCompany: string;
  shippingPartners: { name: string; focus: string; status: string }[];
};

type TrustExplanationInput = {
  trustScore: number;
  rtoCount?: number;
  successfulOrders?: number;
};

type ShippingInput = {
  trustScore: number;
  region?: string;
  availableCarriers: { name: string; coverage?: string }[];
};

type GrowthInput = {
  totalOrders: number;
  successfulOrders: number;
  rtoRate: number;
  successRate: number;
};

const IA_BASE_URL = "https://ia-system.onrender.com";

async function postIa<TInput, TOutput>(
  path: string,
  payload: TInput
): Promise<TOutput | null> {
  try {
    const res = await fetch(`${IA_BASE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return (await res.json()) as TOutput;
  } catch {
    return null;
  }
}

function fallbackDecision(input: AutomationDecisionInput) {
  const digits = input.phoneNumber.replace(/\D/g, "");
  const sum = digits.split("").reduce((s, d) => s + Number(d || 0), 0);
  const trustScore = Math.max(15, Math.min(95, (sum * 7) % 101));
  const riskLevel =
    trustScore >= 70 ? "low" : trustScore >= 40 ? "medium" : "high";
  const requireDeposit = trustScore < input.trustThresholdForDeposit;
  const available = input.shippingPartners.filter(p => p.status === "available");
  const recommendedShippingCompany = input.autoShippingSelectionEnabled
    ? (available[0]?.name ?? input.defaultShippingCompany)
    : input.defaultShippingCompany;
  return {
    trustScore,
    riskLevel,
    requireDeposit,
    recommendedShippingCompany,
    decisionReasons: [
      `درجة الثقة الحالية ${trustScore}%`,
      requireDeposit ? "الطلب يحتاج عربون حسب إعداداتك" : "لا يحتاج عربون حسب إعداداتك",
      `شركة الشحن المقترحة: ${recommendedShippingCompany}`,
    ],
  };
}

export async function evaluateAutomationDecision(input: AutomationDecisionInput) {
  const remote = await postIa<AutomationDecisionInput, ReturnType<typeof fallbackDecision>>(
    "/api/ia/decision",
    input
  );
  return remote ?? fallbackDecision(input);
}

export async function buildWhatsAppValidationMessage(input: {
  phoneNumber: string;
  orderAmount: number;
}) {
  const remote = await postIa<typeof input, { message: string }>(
    "/api/ia/whatsapp-message",
    input
  );
  return (
    remote?.message ??
    `مرحباً، لتأكيد طلبك بقيمة ${input.orderAmount} د.ت على الرقم ${input.phoneNumber} يرجى الرد بكلمة: تأكيد`
  );
}

export async function explainTrust(input: TrustExplanationInput) {
  const remote = await postIa<TrustExplanationInput, unknown>(
    "/api/ia/explain-trust",
    input
  );
  if (remote) return remote;
  const riskLevel =
    input.trustScore >= 70 ? "low" : input.trustScore >= 40 ? "medium" : "high";
  return {
    level: riskLevel === "low" ? "منخفضة" : riskLevel === "medium" ? "متوسطة" : "عالية",
    riskLevel,
    reasons: [`درجة الثقة: ${input.trustScore}%`],
    suggestedAction:
      riskLevel === "low"
        ? "يمكن الشحن المباشر مع متابعة عادية."
        : riskLevel === "medium"
          ? "يُفضّل التحقق عبر واتساب أو طلب عربون حسب السياسة."
          : "يُنصح بطلب عربون أو التحقق قبل الشحن.",
  };
}

export async function selectShippingCarrier(input: ShippingInput) {
  const remote = await postIa<ShippingInput, { carrier: string }>(
    "/api/ia/shipping-recommendation",
    input
  );
  if (remote?.carrier) return remote.carrier;
  if (input.trustScore >= 40 && input.region?.toLowerCase().includes("tunis")) {
    return "Tunisia Express";
  }
  return input.availableCarriers[0]?.name ?? "Rapid-Poste";
}

export async function getGrowthTips(input: GrowthInput) {
  const remote = await postIa<GrowthInput, unknown[]>("/api/ia/growth-tips", input);
  if (remote) return remote;
  return [
    {
      id: "weekly-review",
      title: "مراجعة أسبوعية",
      description:
        "راجع لوحة التحكم كل أسبوع لمقارنة نسبة النجاح وRTO واتخاذ قرارات الشحن.",
      priority: "low",
    },
  ];
}
