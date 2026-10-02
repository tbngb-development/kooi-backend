import { Router, raw } from "express";
import type { RazorpayWebhookController } from "./razorpay-webhook.controller";

/**
 * Public route — signature is verified inside the use case.
 * Uses express.raw() so req.body stays a Buffer for HMAC computation.
 */
export function buildRazorpayWebhookRoutes(
  controller: RazorpayWebhookController,
): Router {
  const router = Router();
  router.post("/", raw({ type: "application/json" }), controller.handle);
  return router;
}
