import type { INestApplication } from "@nestjs/common";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import type { Request, Response, NextFunction } from "express";
import { appRouter } from "../routers/index.js";
import { createContext } from "../trpc.js";

function unwrapTrpcJsonEnvelope(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if ("json" in record && Object.keys(record).length === 1) {
    return record.json;
  }
  return value;
}

function normalizeTrpcBatchInput(req: Request, _res: Response, next: NextFunction) {
  const body = req.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      normalized[key] = unwrapTrpcJsonEnvelope(value);
    }
    req.body = normalized;
  }

  const rawInput = req.query?.input;
  if (typeof rawInput === "string") {
    try {
      const parsed = JSON.parse(rawInput) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const normalized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          normalized[key] = unwrapTrpcJsonEnvelope(value);
        }
        (req.query as Record<string, unknown>).input = JSON.stringify(normalized);
      }
    } catch {
      // Keep original input if parsing fails.
    }
  }

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
