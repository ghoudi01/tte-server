import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { json } from "express";
import { AppModule } from "./modules/app.module.js";
import { mountTrpc } from "./trpc/mount-trpc.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(config.get("PORT", 4000));
  const corsOrigin = config.get("CORS_ORIGIN", "http://localhost:5173");
  const explicitOrigins = corsOrigin
    .split(",")
    .map((v: string) => v.trim())
    .filter(Boolean);

  app.use(cookieParser());
  app.use(json({ limit: "2mb" }));
  const corsOriginDelegate = (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void
  ) => {
      // Allow non-browser calls (curl/server-to-server) and local dev.
      if (!origin) return callback(null, true);
      if (explicitOrigins.includes(origin)) return callback(null, true);
      // Allow Vercel preview/production deployments by default.
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`), false);
  };
  app.enableCors({
    origin: corsOriginDelegate,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
    })
  );

  mountTrpc(app);
  await app.listen(port);
}

bootstrap();
