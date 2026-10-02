import type { Request, Response, NextFunction } from "express";
import type { ProcessRazorpayWebhookUseCase } from "../application/use-cases/process-razorpay-webhook.use-case";
import type { Logger } from "../../../shared/logging/logger.interface";

/**
 * Razorpay webhook endpoint.
 *
 * IMPORTANT: This route MUST be mounted BEFORE express.json() in app/index.ts.
 * The express.raw() middleware in the route definition preserves the body as a
 * Buffer, which is required for HMAC signature verification.
 */
export class RazorpayWebhookController {
  constructor(
    private readonly processWebhook: ProcessRazorpayWebhookUseCase,
    private readonly logger?: Logger,
  ) {}

  handle = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const signature = req.headers["x-razorpay-signature"] as string;

      // express.raw() produces a Buffer; convert to string for HMAC
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body.toString("utf-8")
        : typeof req.body === "string"
          ? req.body
          : "";

      if (!signature || !rawBody) {
        this.logger?.warn("Razorpay webhook missing signature or body", {
          action: "webhook.razorpay.missing_fields",
          hasSignature: Boolean(signature),
          hasBody: Boolean(rawBody),
        });
        res
          .status(400)
          .json({ success: false, error: "Missing signature or body" });
        return;
      }

      const result = await this.processWebhook.execute({
        rawBody,
        signature,
      });

      if (result.handled) {
        res.status(200).json({ success: true, message: "Webhook processed" });
      } else {
        res.status(200).json({ success: true, message: "Event ignored" });
      }
    } catch (err) {
      next(err);
    }
  };
}
