import type { Request, Response, NextFunction } from "express";
import type { ProcessRazorpayWebhookUseCase } from "../application/use-cases/process-razorpay-webhook.use-case";

/**
 * Razorpay webhook endpoint.
 * The raw body must be preserved for HMAC verification.
 * Ensure the route is mounted BEFORE any JSON body parser middleware,
 * or use a raw body parser for this specific route.
 */
export class RazorpayWebhookController {
  constructor(private readonly processWebhook: ProcessRazorpayWebhookUseCase) {}

  handle = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const signature = req.headers["x-razorpay-signature"] as string;
      const rawBody = (req as Request & { rawBody?: string }).rawBody ?? "";

      if (!signature || !rawBody) {
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
