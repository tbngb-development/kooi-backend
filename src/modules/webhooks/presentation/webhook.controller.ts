import type { Request, Response } from "express";
import type { ProcessCallWebhookUseCase } from "../application/use-cases/process-call-webhook.use-case";
import type { ProcessBatchWebhookUseCase } from "../application/use-cases/process-batch-webhook.use-case";
import type { ProcessSarvamWebhookUseCase } from "../application/use-cases/process-sarvam-webhook.use-case";
import type { NextFunction } from "express";
import type {
  WebhookCallPayload,
  WebhookBatchPayload,
} from "../application/dto/webhook.dto";
import type { Logger } from "../../../shared/logging/logger.interface";

export class WebhookController {
  constructor(
    private readonly processCallWebhook: ProcessCallWebhookUseCase,
    private readonly processBatchWebhook: ProcessBatchWebhookUseCase,
    private readonly processSarvamWebhook?: ProcessSarvamWebhookUseCase,
    private readonly logger?: Logger,
  ) {}

  bolna = async (
    req: Request<unknown, unknown, WebhookCallPayload>,
    res: Response,
  ): Promise<void> => {
    // Stateless response received immediately to prevent timeout blocks
    res.json({ received: true });
    this.logger?.debug("sarvam webhook payload", {
      data: req.body
    })

    try {
      await this.processCallWebhook.execute(req.body);
    } catch (err) {
      this.logger?.error("Per-call webhook processing error", err, {
        action: "webhook.call.processing_error",
      });
    }
  };

  bolnaBatch = async (
    req: Request<unknown, unknown, WebhookBatchPayload>,
    res: Response,
  ): Promise<void> => {
    res.json({ received: true });

    try {
      await this.processBatchWebhook.execute(req.body);
    } catch (err) {
      this.logger?.error("Batch webhook processing error", err, {
        action: "webhook.batch.processing_error",
      });
    }
  };
  sarvam = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!this.processSarvamWebhook) {
        res.status(501).json({ error: "Sarvam webhook handler not configured" });
        return;
      }
      const result = await this.processSarvamWebhook.execute(
        req.body,
        req.headers,
        req.query as Record<string, unknown>,
      );
      res.status(200).json({ received: true, ...result });
    } catch (err) {
      this.logger?.error("Sarvam webhook processing error", err, {
        action: "webhook.sarvam.error",
      });
      next(err);
    }
  };

}
