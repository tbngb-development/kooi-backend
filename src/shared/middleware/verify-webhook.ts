import type { RequestHandler } from "express";
import { UnauthorizedError } from "../errors/unauthorized.error";
import { HEADER_WEBHOOK_SECRET, WebhookMessages } from "../constants";
import { env } from "../config/env";
import type { Logger } from "../logging/logger.interface";

/**
 * Validates that requests contain the correct shared secret in custom headers.
 * Protects stateless, public-facing webhook endpoints from unauthorized POST requests.
 */
export function verifyWebhookSecret(logger?: Logger): RequestHandler {
  return (req, _res, next) => {
    // If webhook secret isn't configured in environment, fail-secure
    const expectedSecret = env.webhook.webhookSecret;

    if (!expectedSecret) {
      logger?.error("Webhook secret not configured in environment", undefined, {
        action: "webhook.verify.missing_config",
      });
      return next(
        new UnauthorizedError("Server webhook configuration is missing"),
      );
    }

    const incomingSecret = req.headers[HEADER_WEBHOOK_SECRET];

    if (!incomingSecret || incomingSecret !== expectedSecret) {
      logger?.warn("Webhook secret mismatch", {
        action: "webhook.verify.secret_mismatch",
        hasIncomingSecret: Boolean(incomingSecret),
      });
      return next(new UnauthorizedError(WebhookMessages.INVALID_SECRET));
    }

    next();
  };
}
