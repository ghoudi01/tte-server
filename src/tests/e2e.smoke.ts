import { appRouter } from "../routers/index.js";
import { normalizeTrpcBatchBody, normalizeTrpcBatchQueryInput } from "../trpc/batch-normalize.js";

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
  console.log("e2e smoke passed");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
