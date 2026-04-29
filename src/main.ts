import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./trpc";
import { initDatabase } from "./store";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "tte-backend", mode: "trpc" });
});

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

void (async () => {
  await initDatabase();
  app.listen(port, "0.0.0.0", () => {
    console.log(`TTE backend listening on ${port}`);
  });
})();
