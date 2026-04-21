import type { INestApplication } from "@nestjs/common";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import type { Request, Response, NextFunction } from "express";
import { appRouter } from "../routers/index.js";
import { createContext } from "../trpc.js";
import { normalizeTrpcBatchBody, normalizeTrpcBatchQueryInput } from "./batch-normalize.js";

function normalizeTrpcBatchInput(req: Request, _res: Response, next: NextFunction) {
  req.body = normalizeTrpcBatchBody(req.body);

  (req.query as Record<string, unknown>).input = normalizeTrpcBatchQueryInput(req.query?.input);

  next();
}

export function mountTrpc(app: INestApplication) {
  const express = app.getHttpAdapter().getInstance();
  express.use(
    "/api/trpc",
    normalizeTrpcBatchInput,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
}
