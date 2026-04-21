import type { INestApplication } from "@nestjs/common";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers/index.js";
import { createContext } from "../trpc.js";

export function mountTrpc(app: INestApplication) {
  const express = app.getHttpAdapter().getInstance();
  express.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
}
