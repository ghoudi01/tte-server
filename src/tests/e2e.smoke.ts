import { appRouter } from "../routers/index.js";
import { normalizeTrpcBatchBody, normalizeTrpcBatchQueryInput } from "../trpc/batch-normalize.js";
import { services } from "../trpc/services.js";
import { PluginApiController } from "../modules/plugin-api/plugin-api.controller.js";
import { PrismaService } from "../modules/prisma/prisma.service.js";

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}

async function run() {
  // Regression test: web's httpBatchLink payload shape { "0": { "json": {...} } }
  const batchBody = {
    0: {
      json: {
        email: "contact@twisgo.com",
        password: "123456789",
        name: "alaeddine rezgani",
      },
    },
  };
  const normalizedBody = normalizeTrpcBatchBody(batchBody) as any;
  if (!normalizedBody?.["0"]?.email || normalizedBody["0"].email !== "contact@twisgo.com") {
    throw new Error("tRPC batch body normalization failed (json envelope not unwrapped)");
  }

  const batchQueryInputRaw = JSON.stringify(batchBody);
  const normalizedQueryInput = normalizeTrpcBatchQueryInput(batchQueryInputRaw);
  const parsedNormalizedQuery = JSON.parse(String(normalizedQueryInput)) as any;
  if (!parsedNormalizedQuery?.["0"]?.email || parsedNormalizedQuery["0"].email !== "contact@twisgo.com") {
    throw new Error("tRPC batch query input normalization failed (json envelope not unwrapped)");
  }

  const caller = appRouter.createCaller({
    req: {} as any,
    res: { cookie() {}, clearCookie() {} } as any,
    user: { id: "smoke-user", email: "smoke@tte.tn" },
  });

  await caller.automation.getAppContent();
  await caller.automation.getHomeContent();
  await caller.automation.getRoadmapIdeas();

  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `smoke-${unique}@tte.tn`;
  const userCaller = appRouter.createCaller({
    req: {} as any,
    res: { cookie() {}, clearCookie() {} } as any,
    user: null,
  });
  const registered = await userCaller.auth.register({
    email,
    password: "123456789",
    name: "Smoke Merchant",
  });
  try {
    await userCaller.auth.register({
      email,
      password: "123456789",
      name: "Smoke Merchant",
    });
    throw new Error("Duplicate registration did not fail");
  } catch (error) {
    if (getErrorCode(error) !== "CONFLICT") {
      throw new Error("Duplicate registration did not map to CONFLICT");
    }
  }

  const authedCaller = appRouter.createCaller({
    req: {} as any,
    res: { cookie() {}, clearCookie() {} } as any,
    user: { id: registered.user.id, email },
  });
  const merchant = await authedCaller.merchants.create({
    businessName: "Smoke Shop",
    email,
    phone: "50123456",
    city: "Tunis",
    productTypes: ["fashion"],
  });
  const rotatedMerchant = await authedCaller.merchants.regenerateApiKey();
  if (!rotatedMerchant.apiKey.startsWith("tte_")) {
    throw new Error("Merchant API key was not regenerated in tte_ format");
  }

  const pluginController = new PluginApiController(
    new PrismaService(),
    services.orders,
    services.phoneVerification
  );
  const pluginOrder = await pluginController.pluginOrders(rotatedMerchant.apiKey, {
    phoneNumber: "50123456",
    orderAmount: 75,
    orderId: `smoke-${unique}`,
    source: "smoke",
    clientName: "Smoke Client",
  });
  if (!pluginOrder.success || pluginOrder.order.merchantId !== merchant.id) {
    throw new Error("Plugin API key could not create an order through REST controller");
  }

  const enhanced = await pluginController.pluginOrdersEnhanced(rotatedMerchant.apiKey, {
    orderId: `smoke-enhanced-${unique}`,
    phoneNumber: "50123456",
    orderAmount: 125,
    paymentMethod: "card",
    customer: {
      fullName: "Enhanced Customer",
      phone: "50123456",
      email: `enhanced-${unique}@tte.tn`,
      registrationDate: new Date().toISOString(),
      totalPreviousOrders: 2,
      totalLifetimeValue: 250,
    },
    items: [{
      productId: "p1",
      productName: "Smart Watch",
      category: "electronics",
      quantity: 1,
      unitPrice: 125,
      total: 125,
    }],
    shippingMethod: "express",
    shippingCost: 10,
    customerEmail: `enhanced-${unique}@tte.tn`,
    sourcePlatform: "woocommerce",
  });
  if (!enhanced.success || enhanced.order.merchantId !== merchant.id) {
    throw new Error("Enhanced order creation failed");
  }

  try {
    await authedCaller.orders.updateStatus({
      orderId: 99999999,
      orderStatus: "delivered",
    });
    throw new Error("Missing order update did not fail");
  } catch (error) {
    const code = getErrorCode(error);
    if (code !== "NOT_FOUND") {
      throw new Error(`Missing order update did not map to NOT_FOUND (${code})`);
    }
  }

  await services.prisma.user.delete({ where: { id: registered.user.id } });

  console.log("e2e smoke passed");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
