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

  app.use(cookieParser());
  app.use(json({ limit: "2mb" }));
  app.enableCors({
    origin: corsOrigin.split(",").map((v: string) => v.trim()),
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
