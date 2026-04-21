import { appRouter } from "../routers/index.js";

async function run() {
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
