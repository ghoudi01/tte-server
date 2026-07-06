import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createCorsOptions } from "./cors-config";
import { appRouter } from "./routers";
import { registerGoogleOAuth } from "./oauth/google";
import { registerFacebookOAuth } from "./oauth/facebook";
import { registerPaymentRoutes } from "./payments/webhooks";
import { registerMetaPageOAuth } from "./meta-oauth";
import { registerMetaWebhookRoutes } from "./meta-webhook";
import { registerPluginApiRoutes } from "./plugin-api";
import { createContext } from "./trpc";
import { initDatabase, pool } from "./store";
import { runMigrations } from "./migrate";

const app = express();
const port = Number(process.env.PORT || 4000);

/** Behind Render/nginx — needed for correct secure cookies / IPs (optional). */
if (process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(cors(createCorsOptions()));
app.use(
  express.json({
    verify: (req, _res, buf: Buffer) => {
      (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  })
);
app.use(cookieParser());

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: "Too many attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", async (_req, res) => {
  const checks: Record<string, string> = {};
  try {
    const dbRes = await pool.query("SELECT 1 AS ok");
    checks.database = dbRes.rows[0]?.ok ? "healthy" : "unhealthy";
  } catch {
    checks.database = "unhealthy";
  }
  const allOk = Object.values(checks).every((v) => v === "healthy");
  res.status(allOk ? 200 : 503).json({
    ok: allOk,
    service: "tte-backend",
    mode: "trpc",
    timestamp: new Date().toISOString(),
    checks,
  });
});

registerPaymentRoutes(app);
registerPluginApiRoutes(app);
registerMetaWebhookRoutes(app);
registerMetaPageOAuth(app);
registerGoogleOAuth(app);
registerFacebookOAuth(app);

// Apply rate limiters
app.use("/api/trpc", apiLimiter);
app.use("/api/auth", authLimiter);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

void (async () => {
  await initDatabase();
  await runMigrations(pool);
  app.listen(port, "0.0.0.0", () => {
    console.log(`TTE backend listening on ${port}`);
  });
})();
