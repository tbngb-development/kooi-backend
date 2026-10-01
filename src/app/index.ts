import express, { type Express } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { createErrorHandler } from "../shared/middleware/error-handler";
import { env } from "../shared/config/env";
import { buildContainer } from "./container";
import { buildRoutes } from "./routes";
import { HttpStatus } from "../shared/constants/http-status";
import { sendError } from "../shared/utils/response";
import { buildRazorpayWebhookRoutes } from "../modules/payments/presentation/razorpay-webhook.routes";
import { buildWebhookRoutes } from "../modules/webhooks/presentation/webhook.routes";
import { createRequestLogger } from "../shared/middleware/request-logger";

export function buildApp(container = buildContainer()): Express {
  const app = express();
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: env.cors.origins,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.use(cookieParser());

  // ── 2. RAZORPAY WEBHOOK — MUST be before express.json() ──────
  // express.raw() needs an unconsumed body stream to produce a Buffer.
  // If express.json() runs first, the stream is already drained.
  app.use(
    "/api/webhooks/razorpay",
    buildRazorpayWebhookRoutes(container.payments.webhookController),
  );

  // ── 3. Body parsers (after webhook routes) ──────
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Structured request logger
  app.use(createRequestLogger(container.logger));

  // ── 4. Bolna webhook routes (JSON body is fine here) ──────
  app.use("/api/webhooks", buildWebhookRoutes(container.webhooks.controller));

  // ── 5. Client API routes ──────
  const globalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1500,
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

  // ── 6. 404 & Global Error Handling ──────
  app.use((req, res) => {
    sendError(
      res,
      HttpStatus.NOT_FOUND,
      `Route ${req.method} ${req.path} not found`,
      "ROUTE_NOT_FOUND",
    );
  });

  app.use(createErrorHandler(container.logger));

  return app;
}
