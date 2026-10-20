import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { CompletePaymentUseCase } from "./complete-payment.use-case";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import { InvalidSignatureError } from "../../domain/errors/payment.errors";
import type {
  WebhookInput,
  RazorpayWebhookPayload,
  ExtractedPaymentDetails,
} from "../dto/payment.dto";
import type { Logger } from "../../../../shared/logging/logger.interface";

/**
 * Processes incoming Razorpay webhook events.
 *
 * Security:
 *  - Verifies webhook HMAC signature (`X-Razorpay-Signature`) before processing.
 *  - Validates captured amount matches the intended recharge amount.
 *
 * Supported Events:
 *  - `payment.captured`: Standard payment captured event across all methods (UPI, Card, Netbanking, Wallet).
 *  - `order.paid`: Order-level paid event firing concurrently with payment capture.
 *  - `payment.failed`: Acknowledged and logged with error diagnostics, without prematurely marking recharge as failed
 *    (per Razorpay documentation on user-initiated retries, e.g. UPI TPAP retry flows).
 *
 * Signature Capturing:
 *  - Stores `webhook:${signature}` as the cryptographic proof of webhook fulfillment,
 *    while extracting banking reference codes (RRN, Bank Txn ID, Auth Code) into audit logs.
 *
 * Idempotency:
 *  - CompletePaymentUseCase checks recharge status atomically before processing.
 *  - Wallet credits use idempotencyKey (`recharge:{id}`).
 *  - Safe to receive duplicate or retried webhooks.
 */
export class ProcessRazorpayWebhookUseCase {
  constructor(
    private readonly payments: IPaymentProvider,
    private readonly completePayment: CompletePaymentUseCase,
    private readonly logger: Logger,
    private readonly rechargeRepo?: RechargeRepository,
  ) {}

  async execute(input: WebhookInput): Promise<{ handled: boolean }> {
    this.logger.info("Razorpay webhook received", {
      action: "webhook.received",
    });

    // 1. Cryptographic HMAC signature verification
    if (!this.payments.verifyWebhookSignature(input.rawBody, input.signature)) {
      this.logger.warn("Razorpay webhook signature invalid", {
        action: "webhook.signature_invalid",
      });
      throw new InvalidSignatureError();
    }

    // 2. Parse payload safely
    let payload: RazorpayWebhookPayload;
    try {
      payload = JSON.parse(input.rawBody) as RazorpayWebhookPayload;
    } catch {
      this.logger.warn("Razorpay webhook payload unparseable", {
        action: "webhook.parse_failed",
      });
      return { handled: false };
    }

    const event = payload?.event;

    // 3. Handle payment.failed diagnostics without invalidating pending order
    if (event === "payment.failed") {
      this.handlePaymentFailedEvent(payload);
      return { handled: true };
    }

    // 4. Filter for supported payment success events
    if (event !== "payment.captured" && event !== "order.paid") {
      this.logger.debug("Razorpay webhook event filtered", {
        action: "webhook.filtered",
        event,
      });
      return { handled: false };
    }

    // 5. Extract normalized payment details across payment methods
    const paymentDetails = this.extractPaymentDetails(payload);
    if (!paymentDetails) {
      this.logger.warn("Razorpay webhook missing order or payment ID", {
        action: "webhook.missing_ids",
        event,
      });
      return { handled: false };
    }

    // 6. Validate captured amount against expected recharge amount (prevent partial/over crediting)
    if (this.rechargeRepo) {
      const recharge = await this.rechargeRepo.findByRazorpayOrderId(
        paymentDetails.orderId,
      );
      if (!recharge) {
        this.logger.warn("Razorpay webhook recharge not found for order", {
          action: "webhook.recharge_not_found",
          orderId: paymentDetails.orderId,
          paymentId: paymentDetails.paymentId,
        });
        return { handled: false };
      }

      if (paymentDetails.amount !== recharge.amount) {
        this.logger.error(
          "Razorpay webhook payment amount mismatch",
          undefined,
          {
            action: "webhook.amount_mismatch",
            orderId: paymentDetails.orderId,
            paymentId: paymentDetails.paymentId,
            expectedAmountPaisa: recharge.amount,
            receivedAmountPaisa: paymentDetails.amount,
          },
        );
        return { handled: false };
      }
    }

    this.logger.info("Razorpay payment verified for capture", {
      action: "webhook.payment_verified",
      event,
      orderId: paymentDetails.orderId,
      paymentId: paymentDetails.paymentId,
      method: paymentDetails.method,
      amountPaisa: paymentDetails.amount,
      acquirerReference: paymentDetails.acquirerReference,
      bank: paymentDetails.bank,
      wallet: paymentDetails.wallet,
      vpa: paymentDetails.vpa,
      card: paymentDetails.card,
    });

    // 7. Store the verified webhook HMAC signature as proof of webhook fulfillment
    const webhookSignature = `webhook:${input.signature}`;

    // 8. Delegate to CompletePayment (idempotent atomic processing)
    await this.completePayment.execute({
      razorpayOrderId: paymentDetails.orderId,
      razorpayPaymentId: paymentDetails.paymentId,
      razorpaySignature: webhookSignature,
    });

    this.logger.info("Razorpay webhook processed successfully", {
      action: "webhook.processed",
      orderId: paymentDetails.orderId,
      paymentId: paymentDetails.paymentId,
      method: paymentDetails.method,
      feePaisa: paymentDetails.feePaisa,
      taxPaisa: paymentDetails.taxPaisa,
    });

    return { handled: true };
  }

  // ── Private Extraction & Helper Methods ────────────────────────

  /**
   * Extracts normalized payment details regardless of whether the event was
   * `payment.captured` or `order.paid`, and across all payment methods
   * (UPI, Netbanking, Card, Wallet).
   */
  private extractPaymentDetails(
    payload: RazorpayWebhookPayload,
  ): ExtractedPaymentDetails | null {
    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;

    const orderId = paymentEntity?.order_id ?? orderEntity?.id ?? null;
    const paymentId = paymentEntity?.id ?? null;

    if (!orderId || !paymentId) {
      return null;
    }

    const acquirerData = paymentEntity?.acquirer_data;
    const acquirerReference =
      acquirerData?.rrn ??
      acquirerData?.bank_transaction_id ??
      acquirerData?.auth_code ??
      acquirerData?.transaction_id ??
      null;

    const cardDetails = paymentEntity?.card
      ? {
          network: paymentEntity.card.network,
          last4: paymentEntity.card.last4,
          type: paymentEntity.card.type,
        }
      : null;

    return {
      orderId,
      paymentId,
      amount: paymentEntity?.amount ?? orderEntity?.amount ?? 0,
      currency: paymentEntity?.currency ?? orderEntity?.currency ?? "INR",
      method: paymentEntity?.method ?? "unknown",
      status: paymentEntity?.status ?? "captured",
      acquirerReference,
      bank: paymentEntity?.bank ?? null,
      wallet: paymentEntity?.wallet ?? null,
      vpa: paymentEntity?.vpa ?? paymentEntity?.upi?.vpa ?? null,
      card: cardDetails,
      feePaisa: paymentEntity?.fee ?? null,
      taxPaisa: paymentEntity?.tax ?? null,
    };
  }

  /**
   * Logs payment failure diagnostics according to Razorpay error structure.
   * Does NOT prematurely mark the recharge as failed in DB to allow for user-initiated
   * retries (especially common in UPI TPAP apps like Google Pay or PhonePe).
   */
  private handlePaymentFailedEvent(payload: RazorpayWebhookPayload): void {
    const paymentEntity = payload.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id ?? payload.payload?.order?.entity?.id;

    this.logger.warn("Razorpay payment failed webhook received", {
      action: "webhook.payment_failed",
      orderId,
      paymentId: paymentEntity?.id,
      method: paymentEntity?.method,
      errorCode: paymentEntity?.error_code,
      errorDescription: paymentEntity?.error_description,
      errorSource: paymentEntity?.error_source,
      errorStep: paymentEntity?.error_step,
      errorReason: paymentEntity?.error_reason,
    });
  }
}

