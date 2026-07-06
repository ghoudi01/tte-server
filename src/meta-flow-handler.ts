import { evaluateSocialOrderDecision } from "./social-decision";
import {
  clearMetaConversationSession,
  createOrder,
  getMetaConversationSession,
  type MetaConversationSessionState,
  upsertMetaConversationSession,
  listMerchantProductCategories,
  listProductsByMerchantAndCategory,
  searchMerchantProducts,
  findOrderByPhone,
  listProductsByMerchant,
} from "./store";
import { graphSendText, graphSendCarousel } from "./meta-graph";
import { e164TunisiaFromNational, normalizeTunisiaMobile } from "./tunisia-phone";

const MSG: Record<string, string> = {
  APPROVE: "✅ تم تأكيد طلبك! سيتم التواصل معك قريباً.",
  CONFIRM: "📞 سيتم الاتصال بك لتأكيد الطلب.",
  REQUIRE_DEPOSIT: "💰 يلزم دفع عربون صغير قبل التأكيد. سيتم التواصل معك.",
  VERIFY_CALL: "📱 يلزم التأكد من رقمك عبر مكالمة. سيتم الاتصال بك قريباً.",
};

function initialState(): MetaConversationSessionState {
  return {
    phase: "idle",
    flowKey: "catalog",
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
    t === "السلام" ||
    t.includes("السلام عليكم")
  );
}

const FIELD_PROMPTS: Record<string, string> = {
  phone: "📱 أرسل رقم الهاتف (مثال: 98 123 456)",
  name: "👤 الاسم الكامل",
  address: "📍 عنوان التوصيل",
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
  const { senderId, merchantId, pageAccessTokenPlain, messaging, metaEntryId, channel } = opts;

  let session = await getMetaConversationSession(metaEntryId, senderId, channel);
  let state = session?.state ?? initialState();
  if (session && session.merchantId !== merchantId) {
    state = initialState();
  }

  const postback = messaging.postback as
    | { payload?: string; referral?: unknown }
    | undefined;
  const message = messaging.message as
    | { text?: string; quick_reply?: { payload?: string } }
    | undefined;

  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const quickPayload =
    typeof message?.quick_reply?.payload === "string" ? message.quick_reply.payload : "";
  const postPayload =
    typeof postback?.payload === "string" ? postback.payload : "";
  const payload = quickPayload || postPayload;

  const atMenu = state.phase === "idle" || state.phase === "menu" || state.phase === "done";

  // Reset / start
  if (payload === "TTE_RESET" || payload === "GET_STARTED" || (atMenu && text && isStartTrigger(text))) {
    state = initialState();
    await sendMainMenu(pageAccessTokenPlain, senderId, metaEntryId, merchantId, channel, state);
    return;
  }

  // Handle payload-based navigation
  if (payload) {
    // Back to main menu
    if (payload === "tte_menu") {
      await sendMainMenu(pageAccessTokenPlain, senderId, metaEntryId, merchantId, channel, state);
      return;
    }
    // Back to categories
    if (payload === "tte_cats") {
      await sendCategories(pageAccessTokenPlain, senderId, metaEntryId, merchantId, channel, state);
      return;
    }
    // Track order
    if (payload === "tte_track") {
      state.phase = "tracking";
      state.checkoutFieldIndex = 0;
      await saveAndReply(pageAccessTokenPlain, senderId, state, metaEntryId, merchantId, channel, "📱 أرسل رقم هاتفك للبحث عن الطلب");
      return;
    }
    // View products → categories
    if (payload === "tte_products") {
      await sendCategories(pageAccessTokenPlain, senderId, metaEntryId, merchantId, channel, state);
      return;
    }
    // Search mode
    if (payload === "tte_search") {
      state.phase = "search";
      await saveAndReply(pageAccessTokenPlain, senderId, state, metaEntryId, merchantId, channel, "🔍 اكتب كلمة للبحث عن منتج (مثال: حذاء، قميص...)");
      return;
    }
    // Category selection
    if (payload.startsWith("tte_cat|")) {
      const category = payload.slice("tte_cat|".length);
      state.selectedCategory = category;
      await sendProducts(pageAccessTokenPlain, senderId, category, metaEntryId, merchantId, channel, state);
      return;
    }
    // Product selected
    if (payload.startsWith("tte_prod|")) {
      const productId = payload.slice("tte_prod|".length);
      const products = await listProductsByMerchant(merchantId);
      const product = products.find(p => p.id === productId);
      if (!product) {
        await graphSendText(pageAccessTokenPlain, senderId, "هذا المنتج غير متوفر حالياً.");
        return;
      }
      state.selectedProductId = product.id;
      state.selectedProductName = product.name;
      state.selectedProductPrice = product.price;
      state.phase = "checkout";
      state.checkoutFieldIndex = -1;
      await saveState(pageAccessTokenPlain, senderId, state, metaEntryId, merchantId, channel);
      const msg = `🛍️ ${product.name}\n💰 ${product.price} د.ت\n━━━━━━━━━━━━━\nاضغط "اشتر الآن" لإتمام الطلب.`;
      await graphSendText(pageAccessTokenPlain, senderId, msg, [
        { content_type: "text" as const, title: "🛒 اشتر الآن", payload: "TTE_BUY" },
      ]);
      return;
    }
  }

  // Text in idle/menu/done → show menu
  if ((state.phase === "idle" || state.phase === "done") && text) {
    await sendMainMenu(pageAccessTokenPlain, senderId, metaEntryId, merchantId, channel, state);
    return;
  }

  // Text in search mode
  if (state.phase === "search" && text) {
    const results = await searchMerchantProducts(merchantId, text);
    if (results.length === 0) {
      await graphSendText(pageAccessTokenPlain, senderId, "😕 لا توجد نتائج. جرب كلمة أخرى.", [
        { content_type: "text" as const, title: "🔙 العودة", payload: "tte_menu" },
      ]);
      return;
    }
    if (results.length <= 5) {
      const lines = results.map((p, i) => `• ${p.name} — ${p.price} د.ت`).join("\n");
      const quickReplies = results.slice(0, 5).map(p => ({
        content_type: "text" as const,
        title: p.name.slice(0, 20),
        payload: `tte_prod|${p.id}`,
      }));
      quickReplies.push({ content_type: "text" as const, title: "🔙 رجوع", payload: "tte_menu" });
      await graphSendText(pageAccessTokenPlain, senderId, `🔍 نتائج البحث:\n${lines}\n━━━━━━━━━━━━━\nاختر منتجاً:`, quickReplies);
      return;
    }
    // Many results → show as text list
    const lines = results.map((p, i) => `• ${p.name} — ${p.price} د.ت`).join("\n");
    await graphSendText(pageAccessTokenPlain, senderId, `🔍 نتائج البحث (${results.length}):\n${lines}\n━━━━━━━━━━━━━\nأرسل اسم المنتج بالضبط للاختيار.`, [
      { content_type: "text" as const, title: "🔙 رجوع", payload: "tte_menu" },
    ]);
    state.phase = "menu";
    return;
  }

  // Tracking phase
  if (state.phase === "tracking" && text) {
    const n = normalizeTunisiaMobile(text);
    if (!n) {
      await graphSendText(pageAccessTokenPlain, senderId, "رقم غير صالح. أرسل رقم هاتف تونسي صحيح (مثال: 98 123 456).");
      return;
    }
    const e164 = e164TunisiaFromNational(n);
    const order = await findOrderByPhone(merchantId, e164);
    if (!order) {
      await graphSendText(pageAccessTokenPlain, senderId, `لا يوجد طلب بهذا الرقم (${e164}).`, [
        { content_type: "text" as const, title: "🔙 القائمة", payload: "tte_menu" },
      ]);
      state.phase = "menu";
      return;
    }
    const statusMap: Record<string, string> = {
      pending: "قيد الانتظار ⏳",
      confirmed: "تم التأكيد ✅",
      delivered: "تم التوصيل ✅📦",
      returned: "مرتجع 🔙",
      cancelled: "ملغي ❌",
    };
    const statusText = statusMap[order.status] ?? order.status;
    await graphSendText(pageAccessTokenPlain, senderId,
      `🔍 حالة الطلب:\n📦 المنتج: ${order.productName || "—"}\n📞 الرقم: ${e164}\n📌 الحالة: ${statusText}\n📅 التاريخ: ${new Date(order.createdAt).toLocaleDateString("ar-TN")}`,
      [
        { content_type: "text" as const, title: "🔙 القائمة", payload: "tte_menu" },
      ]
    );
    state.phase = "menu";
    return;
  }

  // Checkout phase — waiting for buy
  if (state.phase === "checkout" && state.checkoutFieldIndex === -1) {
    if (payload === "TTE_BUY") {
      state.checkoutFieldIndex = 0;
      await promptNextField(pageAccessTokenPlain, senderId, state, metaEntryId, merchantId, channel);
      return;
    }
    return;
  }

  // Checkout phase — collecting fields
  if (state.phase === "checkout" && state.checkoutFieldIndex >= 0) {
    const fields = ["phone", "name", "city"];
    if (!text && !payload) {
      await graphSendText(pageAccessTokenPlain, senderId, "يرجى إرسال النص.");
      return;
    }
    const raw = text || "";
    const idx = state.checkoutFieldIndex;
    if (idx >= fields.length) {
      await finalizeOrder({
        merchantId, state, metaEntryId, senderId, channel, pageAccessTokenPlain,
      });
      return;
    }
    const field = fields[idx];
    if (field === "phone") {
      const n = normalizeTunisiaMobile(raw);
      if (!n) {
        await graphSendText(pageAccessTokenPlain, senderId, "❌ رقم غير صالح. " + FIELD_PROMPTS.phone);
        return;
      }
      state.checkoutAnswers.phone = e164TunisiaFromNational(n);
    } else {
      state.checkoutAnswers[field] = raw;
    }
    state.checkoutFieldIndex += 1;
    if (state.checkoutFieldIndex >= fields.length) {
      await finalizeOrder({
        merchantId, state, metaEntryId, senderId, channel, pageAccessTokenPlain,
      });
      return;
    }
    await promptNextField(pageAccessTokenPlain, senderId, state, metaEntryId, merchantId, channel);
    return;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function saveState(
  token: string, senderId: string, state: MetaConversationSessionState,
  metaEntryId: string, merchantId: string, channel: string,
) {
  await upsertMetaConversationSession({
    merchantId, pageId: metaEntryId, senderId, channel, state,
  });
}

async function saveAndReply(
  token: string, senderId: string, state: MetaConversationSessionState,
  metaEntryId: string, merchantId: string, channel: string, text: string,
  quickReplies?: { content_type: "text"; title: string; payload: string }[],
) {
  await saveState(token, senderId, state, metaEntryId, merchantId, channel);
  await graphSendText(token, senderId, text, quickReplies);
}

async function sendMainMenu(
  token: string, senderId: string,
  metaEntryId: string, merchantId: string, channel: string,
  state: MetaConversationSessionState,
) {
  state.phase = "menu";
  await saveState(token, senderId, state, metaEntryId, merchantId, channel);
  await graphSendText(token, senderId,
    "👋 مرحباً بك! اختر أحد الخيارات:",
    [
      { content_type: "text" as const, title: "🛍️ عرض المنتجات", payload: "tte_products" },
      { content_type: "text" as const, title: "🔍 بحث", payload: "tte_search" },
      { content_type: "text" as const, title: "📦 حالة طلب", payload: "tte_track" },
    ],
  );
}

async function sendCategories(
  token: string, senderId: string,
  metaEntryId: string, merchantId: string, channel: string,
  state: MetaConversationSessionState,
) {
  state.phase = "categories";
  state.selectedProductId = undefined;
  state.selectedProductName = undefined;
  state.selectedProductPrice = undefined;
  const categories = await listMerchantProductCategories(merchantId);
  await saveState(token, senderId, state, metaEntryId, merchantId, channel);
  if (categories.length === 0) {
    await graphSendText(token, senderId,
      '📭 لا توجد منتجات متاحة حالياً. أضف منتجات في لوحة التحكم ثم فعّل خيار "عرض في البوت".',
      [{ content_type: "text" as const, title: "🔙 رجوع", payload: "tte_menu" }],
    );
    return;
  }
  const quickReplies = categories.slice(0, 10).map(c => ({
    content_type: "text" as const,
    title: c.slice(0, 20),
    payload: `tte_cat|${c}`,
  }));
  quickReplies.push({ content_type: "text" as const, title: "🔙 رجوع", payload: "tte_menu" });
  await graphSendText(token, senderId, "📂 اختر تصنيفاً:", quickReplies);
}

async function sendProducts(
  token: string, senderId: string, category: string,
  metaEntryId: string, merchantId: string, channel: string,
  state: MetaConversationSessionState,
) {
  state.phase = "products";
  const products = await listProductsByMerchantAndCategory(merchantId, category);
  await saveState(token, senderId, state, metaEntryId, merchantId, channel);
  if (products.length === 0) {
    await graphSendText(token, senderId,
      `📭 لا توجد منتجات في تصنيف "${category}" حالياً.`,
      [{ content_type: "text" as const, title: "🔙 التصنيفات", payload: "tte_cats" }],
    );
    return;
  }
  if (products.length <= 5) {
    const lines = products.map((p, i) => `• ${p.name} — ${p.price} د.ت${p.imageUrl ? "\n  🖼️ " + p.imageUrl.slice(0, 60) : ""}`).join("\n");
    const quickReplies = products.slice(0, 5).map(p => ({
      content_type: "text" as const,
      title: p.name.slice(0, 20),
      payload: `tte_prod|${p.id}`,
    }));
    quickReplies.push({ content_type: "text" as const, title: "🔙 التصنيفات", payload: "tte_cats" });
    await graphSendText(token, senderId, `📂 ${category}\n━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━\nاختر منتجاً:`, quickReplies);
  } else {
    // Many products: list all
    const lines = products.map((p, i) => `${i + 1}. ${p.name} — ${p.price} د.ت`).join("\n");
    const quickReplies = products.slice(0, 5).map(p => ({
      content_type: "text" as const,
      title: p.name.slice(0, 20),
      payload: `tte_prod|${p.id}`,
    }));
    quickReplies.push({ content_type: "text" as const, title: "🔙 التصنيفات", payload: "tte_cats" });
    await graphSendText(token, senderId, `📂 ${category} (${products.length} منتج)\n━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━\nاختر منتجاً:`, quickReplies);
  }
}

async function promptNextField(
  token: string, senderId: string, state: MetaConversationSessionState,
  metaEntryId: string, merchantId: string, channel: string,
) {
  const fields = ["phone", "name", "city"];
  const idx = state.checkoutFieldIndex;
  if (idx >= fields.length) return;
  const prompt = FIELD_PROMPTS[fields[idx]] ?? `أدخل ${fields[idx]}`;
  state.phase = "checkout";
  await saveState(token, senderId, state, metaEntryId, merchantId, channel);
  await graphSendText(token, senderId, prompt);
}

async function finalizeOrder(opts: {
  merchantId: string;
  state: MetaConversationSessionState;
  metaEntryId: string;
  senderId: string;
  channel: "messenger" | "instagram";
  pageAccessTokenPlain: string;
}) {
  const { merchantId, state, metaEntryId, senderId, channel, pageAccessTokenPlain } = opts;
  const phone = String(state.checkoutAnswers.phone ?? "");
  const name = String(state.checkoutAnswers.name ?? "—");
  const city = String(state.checkoutAnswers.city ?? "");
  const productName = state.selectedProductName ?? "—";
  const productPrice = state.selectedProductPrice ?? 0;

  const { action } = await evaluateSocialOrderDecision({
    phoneNumber: phone,
    amount: productPrice,
  });

  await createOrder({
    merchantId,
    customerName: name,
    phoneNumber: phone,
    city: city || undefined,
    orderAmount: productPrice,
    status: "pending",
    verificationStatus: "pending",
    productId: state.selectedProductId || undefined,
    metadata: {
      channel,
      source: "social_sellers_meta",
      productName,
      checkoutAnswers: state.checkoutAnswers,
      metaSenderId: senderId,
      metaEntryId,
    },
  });

  state.phase = "done";
  await upsertMetaConversationSession({
    merchantId, pageId: metaEntryId, senderId, channel, state,
  });

  // Send trust result to customer (generic)
  const summary = `✅ تم استلام طلبك!\n━━━━━━━━━━━━━\n🛍️ المنتج: ${productName}\n💰 المبلغ: ${productPrice} د.ت\n📞 الرقم: ${phone}\n📌 ${MSG[action] ?? MSG.CONFIRM}\n━━━━━━━━━━━━━\n📱 للطلب مجدداً اكتب "مرحبا"`;
  await graphSendText(pageAccessTokenPlain, senderId, summary, [
    { content_type: "text" as const, title: "🔄 طلب جديد", payload: "tte_menu" },
  ]);

  await clearMetaConversationSession(metaEntryId, senderId, channel);
}
