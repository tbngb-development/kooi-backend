import { Router } from "express";
import type { WebhookController } from "./webhook.controller";

/**
 * Public public endpoints for Bolna dashboard service integration.
 * Secured via verifyWebhookSecret header guard.
 *
 * Target mounting pattern: /webhooks
 */
export function buildWebhookRoutes(controller: WebhookController): Router {
  const router = Router();

  router.post("/bolna", controller.bolna);
  router.post("/bolna-batch", controller.bolnaBatch);

  return router;
}
