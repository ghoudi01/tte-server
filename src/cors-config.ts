import type { CorsOptions } from "cors";

/** Browser dev + production frontends; extend with `CORS_ORIGINS` (comma-separated). */
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://tte.tn",
  "https://www.tte.tn",
  "https://tte-web.vercel.app",
];

/**
 * Preflight must echo headers the browser asks for (Content-Type JSON + tRPC batch).
 * See https://trpc.io/docs/server/cors
 */
const ALLOWED_HEADERS = [
  "Accept",
  "Authorization",
  "Content-Type",
  "Cookie",
  "Origin",
  "Referer",
  "User-Agent",
  "X-Requested-With",
  "trpc-accept",
  "x-trpc-source",
  "x-trpc-bundle",
  "x-trpc-http-batch-link-version",
];

export function createCorsOptions(): CorsOptions {
  const fromEnv =
    process.env.CORS_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const allowed = new Set<string>([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...fromEnv,
  ]);

  const allowAnyOrigin = process.env.CORS_ALLOW_ANY === "true";

  return {
    credentials: true,
    origin(origin, callback) {
      if (allowAnyOrigin) {
        callback(null, true);
        return;
      }
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowed.has(origin)) {
        callback(null, origin);
        return;
      }
      console.warn(`[cors] blocked Origin: ${origin}`);
      callback(new Error(`CORS: origin not allowed: ${origin}`));
    },
    methods: ["GET", "HEAD", "POST", "OPTIONS"],
    allowedHeaders: ALLOWED_HEADERS,
    maxAge: 86_400,
    optionsSuccessStatus: 204,
  };
}
