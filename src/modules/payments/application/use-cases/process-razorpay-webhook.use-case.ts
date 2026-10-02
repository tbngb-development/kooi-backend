import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { CompletePaymentUseCase } from "./complete-payment.use-case";
import { InvalidSignatureError } from "../../domain/errors/payment.errors";
import type { WebhookInput } from "../dto/payment.dto";
import type { Logger } from "../../../../shared/logging/logger.interface";

/**
 * Processes incoming Razorpay webhook events.
 *
 * Security:
 *  - Verifies webhook HMAC signature before parsing.
 *  - Only handles `payment.captured` events.
 *
 * Idempotency:
 *  - CompletePaymentUseCase checks recharge status before processing.
 *  - Wallet credits use idempotencyKey.
 *  - Safe to receive the same webhook multiple times.
 */
export class ProcessRazorpayWebhookUseCase {
  constructor(
    private readonly payments: IPaymentProvider,
    private readonly completePayment: CompletePaymentUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(input: WebhookInput): Promise<{ handled: boolean }> {
    this.logger.info("Razorpay webhook received", {
      action: "webhook.received",
    });

    // 1. Verify webhook signature
    if (!this.payments.verifyWebhookSignature(input.rawBody, input.signature)) {
      this.logger.warn("Razorpay webhook signature invalid", {
        action: "webhook.signature_invalid",
      });
      throw new InvalidSignatureError();
    }

    // 2. Parse payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(input.rawBody);
    } catch {
      this.logger.warn("Razorpay webhook payload unparseable", {
        action: "webhook.parse_failed",
      });
      return { handled: false };
    }

    // 3. Filter: only handle payment.captured
    const event = payload?.event as string | undefined;
    if (event !== "payment.captured") {
      this.logger.debug("Razorpay webhook event filtered", {
        action: "webhook.filtered",
        event,
      });
      return { handled: false };
    }

    // 4. Extract payment entity
    const entity = (payload?.payload as Record<string, unknown>)?.payment as
      Record<string, unknown> | undefined;
    const paymentEntity = entity?.entity as Record<string, unknown> | undefined;

    if (!paymentEntity?.order_id || !paymentEntity?.id) {
      this.logger.warn("Razorpay webhook missing order/payment ID", {
        action: "webhook.missing_ids",
      });
      return { handled: false };
    }

    const razorpayOrderId = paymentEntity.order_id as string;
    const razorpayPaymentId = paymentEntity.id as string;

    this.logger.info("Razorpay payment captured", {
      action: "webhook.payment_captured",
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
    });

    // 5. Delegate to CompletePayment (idempotent)
    await this.completePayment.execute({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature:
        ((paymentEntity?.acquirer_data as Record<string, unknown>)
          ?.rrn as string) ?? "webhook",
    });

    this.logger.info("Razorpay webhook processed successfully", {
      action: "webhook.processed",
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
    });

    return { handled: true };
  }
}
