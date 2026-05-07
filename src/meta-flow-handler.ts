import { evaluateSocialOrderDecision } from "./social-decision";
import {
  clearMetaConversationSession,
  createOrder,
  getMerchantSocialFlowByKey,
  getMetaConversationSession,
  type MetaConversationSessionState,
  upsertMetaConversationSession,
} from "./store";
import { graphSendText } from "./meta-graph";
import { e164TunisiaFromNational, normalizeTunisiaMobile } from "./tunisia-phone";

export const DEFAULT_SOCIAL_FLOW: Record<string, unknown> = {
  orderAmount: 99,
  variantSteps: [
    {
      id: "size",
      prompt: "اختر المقاس",
      options: [
        { title: "S", payload: "tte_var|size|S" },
        { title: "M", payload: "tte_var|size|M" },
        { title: "L", payload: "tte_var|size|L" },
      ],
    },
    {
      id: "color",
      prompt: "اختر اللون",
      options: [
        { title: "أسود", payload: "tte_var|color|black" },
        { title: "أبيض", payload: "tte_var|color|white" },
      ],
    },
  ],
  checkoutFields: ["phone", "name", "address", "city"],
  customCheckoutFields: [] as { id: string; prompt: string }[],
};

const MSG: Record<string, string> = {
  APPROVE: "تم تأكيد طلبك ✅",
  CONFIRM: "باش نأكد الطلب، هل المعلومات صحيحة؟",
  REQUIRE_DEPOSIT: "باش نأكد الطلب، يلزم عربون صغير 👇",
  VERIFY_CALL: "باش نأكد الطلب، جاوب على مكالمة التأكيد",
};

function parseVariantPayload(p: string): { id: string; val: string } | null {
  if (!p.startsWith("tte_var|")) return null;
  const rest = p.slice("tte_var|".length);
  const i = rest.indexOf("|");
  if (i <= 0) return null;
  return { id: rest.slice(0, i), val: rest.slice(i + 1) };
}

type VariantStep = {
  id: string;
  prompt: string;
  options: { title: string; payload: string }[];
};

function coerceFlow(def: Record<string, unknown>): {
  orderAmount: number;
  variantSteps: VariantStep[];
  checkoutFields: string[];
  customCheckoutFields: { id: string; prompt: string }[];
} {
  const orderAmount =
    typeof def.orderAmount === "number" && def.orderAmount >= 0
      ? def.orderAmount
      : 99;
  const variantSteps = Array.isArray(def.variantSteps)
    ? (def.variantSteps as VariantStep[])
    : (DEFAULT_SOCIAL_FLOW.variantSteps as VariantStep[]);
  const checkoutFields = Array.isArray(def.checkoutFields)
    ? (def.checkoutFields as string[])
    : (DEFAULT_SOCIAL_FLOW.checkoutFields as string[]);
  const customCheckoutFields = Array.isArray(def.customCheckoutFields)
    ? (def.customCheckoutFields as { id: string; prompt: string }[])
    : [];
  return { orderAmount, variantSteps, checkoutFields, customCheckoutFields };
}

async function loadFlow(merchantId: string) {
  const row = await getMerchantSocialFlowByKey(merchantId, "default");
  const raw =
    row?.definition && typeof row.definition === "object"
      ? (row.definition as Record<string, unknown>)
      : DEFAULT_SOCIAL_FLOW;
  return coerceFlow(raw);
}

function initialState(flowKey: string): MetaConversationSessionState {
  return {
    phase: "idle",
    flowKey,
    variantStepIndex: 0,
    checkoutFieldIndex: 0,
    variantAnswers: {},
    checkoutAnswers: {},
  };
}

function isStartTrigger(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t === "start" ||
    t === "/start" ||
    t === "hi" ||
    t === "hello" ||
    t.includes("مرحبا") ||
    t.includes("ابدا") ||
    t === "السلام"
  );
}

const FIELD_PROMPTS_AR: Record<string, string> = {
  phone: "📱 أرسل رقم الهاتف التونسي (مثال: 98 xxx xxx)",
  name: "👤 الاسم الكامل",
  address: "📍 عنوان التوصيل التفصيلي",
  city: "🏙️ المدينة",
};

export async function handleInboundMessaging(opts: {
  metaEntryId: string;
  channel: "messenger" | "instagram";
  senderId: string;
  merchantId: string;
  pageAccessTokenPlain: string;
  messaging: Record<string, unknown>;
}) {
  const { senderId, merchantId, pageAccessTokenPlain, messaging, metaEntryId, channel } =
    opts;

  const flow = await loadFlow(merchantId);

  let session = await getMetaConversationSession(metaEntryId, senderId, channel);
  let state = session?.state ?? initialState("default");
  if (session && session.merchantId !== merchantId) {
    state = initialState("default");
  }

  const postback = messaging.postback as
    | { payload?: string; referral?: unknown }
    | undefined;
  const message = messaging.message as
    | {
        text?: string;
        quick_reply?: { payload?: string };
      }
    | undefined;

  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const quickPayload =
    typeof message?.quick_reply?.payload === "string"
      ? message.quick_reply.payload
      : "";
  const postPayload =
    typeof postback?.payload === "string" ? postback.payload : "";

  const payload = quickPayload || postPayload;

  /** Reset */
  if (
    payload === "TTE_RESET" ||
    payload === "GET_STARTED" ||
    ((state.phase === "idle" || state.phase === "done") && text && isStartTrigger(text))
  ) {
    state = initialState("default");
    state.phase = "variants";
    state.variantStepIndex = 0;
    await sendVariantStep(
      pageAccessTokenPlain,
      senderId,
      flow,
      0,
      metaEntryId,
      merchantId,
      channel,
      state
    );
    return;
  }

  if (state.phase === "idle" && text) {
    state.phase = "variants";
    state.variantStepIndex = 0;
    await sendVariantStep(
      pageAccessTokenPlain,
      senderId,
      flow,
      0,
      metaEntryId,
      merchantId,
      channel,
      state
    );
    return;
  }

  if (state.phase === "variants") {
    const step = flow.variantSteps[state.variantStepIndex];
    if (!step) {
      await sendBuyPrompt(
        pageAccessTokenPlain,
        senderId,
        metaEntryId,
        merchantId,
        channel,
        state
      );
      return;
    }

    const parsed = payload ? parseVariantPayload(payload) : null;
    if (!parsed || parsed.id !== step.id) {
      await graphSendText(
        pageAccessTokenPlain,
        senderId,
        `يرجى اختيار خيار من الأزرار أدناه.${step.prompt ? ` ${step.prompt}` : ""}`,
        step.options.map(o => ({
          content_type: "text" as const,
          title: o.title.slice(0, 20),
          payload: o.payload,
        }))
      );
      return;
    }

    state.variantAnswers[parsed.id] = parsed.val;
    state.variantStepIndex += 1;
    if (state.variantStepIndex >= flow.variantSteps.length) {
      await sendBuyPrompt(
        pageAccessTokenPlain,
        senderId,
        metaEntryId,
        merchantId,
        channel,
        state
      );
      return;
    }
    await sendVariantStep(
      pageAccessTokenPlain,
      senderId,
      flow,
      state.variantStepIndex,
      metaEntryId,
      merchantId,
      channel,
      state
    );
    return;
  }

  if (state.phase === "checkout" && state.checkoutFieldIndex === -1) {
    /** Waiting for buy */
    if (payload === "TTE_BUY") {
      state.checkoutFieldIndex = 0;
      await promptNextCheckoutField(
        pageAccessTokenPlain,
        senderId,
        flow,
        metaEntryId,
        merchantId,
        channel,
        state
      );
    }
    return;
  }

  if (state.phase === "checkout" && state.checkoutFieldIndex >= 0) {
    const list = [...flow.checkoutFields, ...flow.customCheckoutFields.map(c => c.id)];
    const totalCheckoutSteps =
      flow.checkoutFields.length + flow.customCheckoutFields.length;

    if (!text && !payload) {
      await graphSendText(pageAccessTokenPlain, senderId, "يرجى إرسال نص صالح.");
      return;
    }

    const rawAnswer = text || "";
    const idx = state.checkoutFieldIndex;
    if (idx >= totalCheckoutSteps) {
      state.phase = "done";
      await graphSendText(pageAccessTokenPlain, senderId, "تم تسجيل الطلب مسبقاً.");
      await clearMetaConversationSession(metaEntryId, senderId, channel);
      return;
    }

    const standardLen = flow.checkoutFields.length;
    if (idx < standardLen) {
      const field = flow.checkoutFields[idx];
      if (field === "phone") {
        const n = normalizeTunisiaMobile(rawAnswer);
        if (!n) {
          await graphSendText(
            pageAccessTokenPlain,
            senderId,
            "رقم غير صالح. " + FIELD_PROMPTS_AR.phone
          );
          return;
        }
        state.checkoutAnswers.phone = e164TunisiaFromNational(n);
      } else {
        state.checkoutAnswers[field] = rawAnswer;
      }
    } else {
      const custom = flow.customCheckoutFields[idx - standardLen];
      if (custom) state.checkoutAnswers[custom.id] = rawAnswer;
    }

    state.checkoutFieldIndex += 1;
    if (state.checkoutFieldIndex >= totalCheckoutSteps) {
      await finalizeOrder({
        merchantId,
        flow,
        state,
        metaEntryId,
        senderId,
        channel,
        pageAccessTokenPlain,
      });
      return;
    }

    await promptNextCheckoutField(
      pageAccessTokenPlain,
      senderId,
      flow,
      metaEntryId,
      merchantId,
      channel,
      state
    );
    return;
  }

  if (state.phase === "done") {
    await graphSendText(
      pageAccessTokenPlain,
      senderId,
      "شكراً! لطلب جديد اكتب «ابدا» أو «start»."
    );
  }
}

async function sendVariantStep(
  token: string,
  senderId: string,
  flow: ReturnType<typeof coerceFlow>,
  stepIndex: number,
  metaEntryId: string,
  merchantId: string,
  channel: "messenger" | "instagram",
  state: MetaConversationSessionState
) {
  const step = flow.variantSteps[stepIndex];
  if (!step) return;
  state.phase = "variants";
  await upsertMetaConversationSession({
    merchantId,
    pageId: metaEntryId,
    senderId,
    channel,
    state,
  });
  await graphSendText(
    token,
    senderId,
    step.prompt,
    step.options.map(o => ({
      content_type: "text" as const,
      title: o.title.slice(0, 20),
      payload: o.payload,
    }))
  );
}

async function sendBuyPrompt(
  token: string,
  senderId: string,
  metaEntryId: string,
  merchantId: string,
  channel: "messenger" | "instagram",
  state: MetaConversationSessionState
) {
  state.phase = "checkout";
  state.checkoutFieldIndex = -1;
  await upsertMetaConversationSession({
    merchantId,
    pageId: metaEntryId,
    senderId,
    channel,
    state,
  });
  await graphSendText(token, senderId, "اضغط «اشتر الآن» لإتمام الطلب.", [
    {
      content_type: "text",
      title: "اشتر الآن",
      payload: "TTE_BUY",
    },
  ]);
}

async function promptNextCheckoutField(
  token: string,
  senderId: string,
  flow: ReturnType<typeof coerceFlow>,
  metaEntryId: string,
  merchantId: string,
  channel: "messenger" | "instagram",
  state: MetaConversationSessionState
) {
  const idx = state.checkoutFieldIndex;
  const standardLen = flow.checkoutFields.length;
  let prompt = "";
  if (idx < standardLen) {
    const f = flow.checkoutFields[idx];
    prompt = FIELD_PROMPTS_AR[f] ?? `أدخل ${f}`;
  } else {
    const c = flow.customCheckoutFields[idx - standardLen];
    prompt = c?.prompt ?? "تفاصيل إضافية";
  }
  state.phase = "checkout";
  await upsertMetaConversationSession({
    merchantId,
    pageId: metaEntryId,
    senderId,
    channel,
    state,
  });
  await graphSendText(token, senderId, prompt);
}

async function finalizeOrder(opts: {
  merchantId: string;
  flow: ReturnType<typeof coerceFlow>;
  state: MetaConversationSessionState;
  metaEntryId: string;
  senderId: string;
  channel: "messenger" | "instagram";
  pageAccessTokenPlain: string;
}) {
  const { merchantId, flow, state, metaEntryId, senderId, channel, pageAccessTokenPlain } =
    opts;
  const phone = String(state.checkoutAnswers.phone ?? "");
  const name = String(state.checkoutAnswers.name ?? "—");
  const address = String(state.checkoutAnswers.address ?? "");
  const city = String(state.checkoutAnswers.city ?? "");

  const { action } = await evaluateSocialOrderDecision({
    phoneNumber: phone,
    amount: flow.orderAmount,
  });

  await createOrder({
    merchantId,
    customerName: name,
    phoneNumber: phone,
    city: city || undefined,
    orderAmount: flow.orderAmount,
    status: "pending",
    verificationStatus: "pending",
    metadata: {
      channel,
      source: "social_sellers_meta",
      variantAnswers: state.variantAnswers,
      extraAnswers: state.checkoutAnswers,
      addressFull: address,
      metaSenderId: senderId,
      metaEntryId,
    },
  });

  state.phase = "done";
  await upsertMetaConversationSession({
    merchantId,
    pageId: metaEntryId,
    senderId,
    channel,
    state,
  });

  await graphSendText(
    pageAccessTokenPlain,
    senderId,
    MSG[action] ?? MSG.CONFIRM
  );

  await clearMetaConversationSession(metaEntryId, senderId, channel);
}
