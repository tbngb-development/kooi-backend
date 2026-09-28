import express, { type Express } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser"; // <-- Added
import { errorHandler } from "../shared/middleware/error-handler";
import { env } from "../shared/config/env";
import { buildContainer } from "./container";
import { buildRoutes } from "./routes";
import { HttpStatus } from "../shared/constants/http-status";
import { sendError } from "../shared/utils/response";
import { buildRazorpayWebhookRoutes } from "../modules/payments/presentation/razorpay-webhook.routes";
import { buildWebhookRoutes } from "../modules/webhooks/presentation/webhook.routes";

export function buildApp(): Express {
  const app = express();
  app.set("trust proxy", 1);

  // 1. Standard global middleware
  app.use(
    cors({
      origin: env.cors.origins,
      credentials: true, // <-- Essential for cookies to be sent across origins
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.use(cookieParser()); // <-- Added before routes/limiter
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Simple request logger
  app.use((req, _res, next) => {
    if (env.isDev) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });

  const container = buildContainer();

  // ── 2. WEBHOOK ROUTES ──────
  app.use(
    "/api/webhooks/razorpay",
    buildRazorpayWebhookRoutes(container.payments.webhookController),
  );
  app.use("/api/webhooks", buildWebhookRoutes(container.webhooks.controller));

  // ── 3. CLIENT API ROUTES
  const globalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1500, // ~100 req/min for normal SPA usage
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please slow down.",
    },
  });

  const apiRoutes = buildRoutes(container);
  app.use("/api", globalApiLimiter, apiRoutes);

  // ── 4. 404 & Global Error Handling ─────────────────────────────────────
  app.use((req, res) => {
    sendError(
      res,
      HttpStatus.NOT_FOUND,
      `Route ${req.method} ${req.path} not found`,
      "ROUTE_NOT_FOUND",
    );
  });

  app.use(errorHandler);

  return app;
}
