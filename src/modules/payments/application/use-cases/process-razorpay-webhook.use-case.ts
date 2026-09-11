import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { CompletePaymentUseCase } from "./complete-payment.use-case";
import { InvalidSignatureError } from "../../domain/errors/payment.errors";
import type { WebhookInput } from "../dto/payment.dto";

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
  ) {}

  async execute(input: WebhookInput): Promise<{ handled: boolean }> {
    // 1. Verify webhook signature
    if (!this.payments.verifyWebhookSignature(input.rawBody, input.signature)) {
      throw new InvalidSignatureError();
    }

    // 2. Parse payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(input.rawBody);
    } catch {
      return { handled: false };
    }

    // 3. Filter: only handle payment.captured
    const event = payload?.event as string | undefined;
    if (event !== "payment.captured") {
      return { handled: false };
    }

    // 4. Extract payment entity
    const entity = (payload?.payload as Record<string, unknown>)?.payment as
      Record<string, unknown> | undefined;
    const paymentEntity = entity?.entity as Record<string, unknown> | undefined;

    if (!paymentEntity?.order_id || !paymentEntity?.id) {
      return { handled: false };
    }

    // 5. Delegate to CompletePayment (idempotent)
    await this.completePayment.execute({
      razorpayOrderId: paymentEntity.order_id as string,
      razorpayPaymentId: paymentEntity.id as string,
      razorpaySignature:
        ((paymentEntity?.acquirer_data as Record<string, unknown>)
          ?.rrn as string) ?? "webhook",
    });

    return { handled: true };
  }
}
