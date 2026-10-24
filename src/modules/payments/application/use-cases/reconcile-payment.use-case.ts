import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import type { CompletePaymentUseCase } from "./complete-payment.use-case";
import { RechargeNotFoundError } from "../../domain/errors/payment.errors";
import type { ReconcilePaymentResult } from "../dto/payment.dto";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface ReconcilePaymentInput {
  rechargeId: string;
  adminUserId: string;
}

/**
 * Reconciles an unconfirmed or stuck payment by querying Razorpay's live order status.
 *
 * Flow:
 *  1. Look up recharge by ID
 *  2. If already SUCCESS, return early (idempotent fast path)
 *  3. If no razorpayOrderId, return un-reconcilable status
 *  4. Query live gateway payments: provider.getOrderPayments(orderId)
 *  5. If a captured payment is found, complete the payment (credits wallet atomically)
 *  6. If all payment attempts are failed, mark recharge as FAILED with gateway reason
 *  7. If payment is still pending/attempted, return current gateway status
 */
export class ReconcilePaymentUseCase {
  constructor(
    private readonly rechargeRepo: RechargeRepository,
    private readonly payments: IPaymentProvider,
    private readonly completePayment: CompletePaymentUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(input: ReconcilePaymentInput): Promise<ReconcilePaymentResult> {
    const recharge = await this.rechargeRepo.findById(input.rechargeId);
    if (!recharge) throw new RechargeNotFoundError(input.rechargeId);

    // Fast path: already marked SUCCESS
    if (recharge.status === "SUCCESS") {
      this.logger.info("Payment reconcile — already marked SUCCESS", {
        action: "payment.reconcile.already_success",
        rechargeId: recharge.id,
        tenantId: recharge.tenantId,
        adminUserId: input.adminUserId,
      });

      return {
        rechargeId: recharge.id,
        status: "SUCCESS",
        previousStatus: "SUCCESS",
        reconciled: false,
        message: "Payment is already marked as SUCCESS and credited.",
        razorpayPaymentId: recharge.razorpayPaymentId ?? null,
      };
    }

    if (!recharge.razorpayOrderId) {
      return {
        rechargeId: recharge.id,
        status: recharge.status,
        previousStatus: recharge.status,
        reconciled: false,
        message: "No Razorpay order ID associated with this payment record.",
        razorpayPaymentId: recharge.razorpayPaymentId ?? null,
      };
    }

    // Query live Razorpay order payments
    const payments = await this.payments.getOrderPayments(recharge.razorpayOrderId);

    // 1. Check for a captured payment
    const captured = payments.find((p) => p.captured && p.status === "captured");
    if (captured) {
      await this.completePayment.execute({
        razorpayOrderId: recharge.razorpayOrderId,
        razorpayPaymentId: captured.id,
        razorpaySignature: `reconciled_by_admin_${input.adminUserId}`,
      });

      this.logger.info("Payment reconciled and settled via gateway poll", {
        action: "payment.reconcile.settled",
        rechargeId: recharge.id,
        tenantId: recharge.tenantId,
        razorpayOrderId: recharge.razorpayOrderId,
        razorpayPaymentId: captured.id,
        adminUserId: input.adminUserId,
      });

      return {
        rechargeId: recharge.id,
        status: "SUCCESS",
        previousStatus: recharge.status,
        reconciled: true,
        message: `Successfully reconciled. Captured payment ${captured.id} verified on Razorpay and credited.`,
        razorpayPaymentId: captured.id,
      };
    }

    // 2. Check if payments explicitly failed
    const failed = payments.find((p) => p.status === "failed");
    if (failed && payments.every((p) => p.status === "failed")) {
      const reason = `Gateway sync: payment ${failed.id} failed on Razorpay`;
      await this.rechargeRepo.markFailed(recharge.id, reason);

      this.logger.warn("Payment marked as FAILED via gateway poll", {
        action: "payment.reconcile.failed",
        rechargeId: recharge.id,
        tenantId: recharge.tenantId,
        razorpayOrderId: recharge.razorpayOrderId,
        failedPaymentId: failed.id,
        adminUserId: input.adminUserId,
      });

      return {
        rechargeId: recharge.id,
        status: "FAILED",
        previousStatus: recharge.status,
        reconciled: true,
        message: `Payment marked as FAILED based on Razorpay status (${failed.id}).`,
        razorpayPaymentId: failed.id,
      };
    }

    // 3. Still pending/unattempted on gateway
    return {
      rechargeId: recharge.id,
      status: recharge.status,
      previousStatus: recharge.status,
      reconciled: false,
      message:
        payments.length === 0
          ? "No payment attempts recorded on Razorpay for this order."
          : `Payment is still ${payments[0].status} on Razorpay.`,
      razorpayPaymentId: payments[0]?.id ?? null,
    };
  }
}
