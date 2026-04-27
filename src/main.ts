import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { json, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { AppModule } from "./modules/app.module.js";
import { mountTrpc } from "./trpc/mount-trpc.js";
import { SanitizationPipe } from "./common/sanitization.pipe.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(config.get("PORT", 4000));
  const corsOrigin = config.get("CORS_ORIGIN", "http://localhost:5173");
  const explicitOrigins = corsOrigin
    .split(",")
    .map((v: string) => v.trim())
    .filter(Boolean);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  app.use(cookieParser());
  app.use(json({ limit: "2mb" }));

  // Request ID tracking
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers["x-request-id"]?.toString() ?? randomUUID();
    const startedAt = Date.now();
    res.setHeader("x-request-id", requestId);
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      console.info(
        JSON.stringify({
          level: "info",
          requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs,
        })
      );
    });
    next();
  });

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests',
  });
  app.use("/api", apiLimiter);
  app.use("/tte", apiLimiter);

  const corsOriginDelegate = (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void
  ) => {
    if (!origin) return callback(null, true);
    if (explicitOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed: ${origin}`), false);
  };
  app.enableCors({
    origin: corsOriginDelegate,
    credentials: true,
  });

  // Apply global pipes: sanitize first, then validate
  app.useGlobalPipes(new SanitizationPipe());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
      disableErrorMessages: false,
    })
  );

  mountTrpc(app);
  await app.listen(port);

  console.log(`🚀 Server running on port ${port}`);
}

bootstrap();
