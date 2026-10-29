import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import type { CompletePaymentUseCase } from "./complete-payment.use-case";
import type { ReconcileStalePaymentsResult } from "../dto/payment.dto";
import type { Logger } from "../../../../shared/logging/logger.interface";

/**
 * Periodically reconciles stale INITIATED payments against Razorpay.
 *
 * Rules:
 *  - Evaluates payments in INITIATED status older than timeoutMinutes (default 30m).
 *  - Captured payments -> completed as SUCCESS and wallet credited.
 *  - Authorized payments -> auto-captured via Razorpay API and completed as SUCCESS.
 *  - All attempts failed -> marked as FAILED with failure reason.
 *  - 0 attempts recorded -> marked as EXPIRED (abandoned checkout).
 *  - In-flight/unresolved attempts -> retained in INITIATED for next cycle.
 */
export class ReconcileStalePaymentsUseCase {
  constructor(
    private readonly rechargeRepo: RechargeRepository,
    private readonly payments: IPaymentProvider,
    private readonly completePayment: CompletePaymentUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(options?: {
    timeoutMinutes?: number;
    batchSize?: number;
  }): Promise<ReconcileStalePaymentsResult> {
    const timeoutMinutes = options?.timeoutMinutes ?? 30;
    const batchSize = options?.batchSize ?? 50;
    const cutoffDate = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const staleRecharges = await this.rechargeRepo.findStaleInitiated(
      cutoffDate,
      batchSize,
    );

    const result: ReconcileStalePaymentsResult = {
      scannedCount: staleRecharges.length,
      reconciledSuccessCount: 0,
      reconciledFailedCount: 0,
      reconciledExpiredCount: 0,
      skippedCount: 0,
    };

    if (staleRecharges.length === 0) {
      return result;
    }

    this.logger.info("Starting stale payment reconciliation batch", {
      action: "payment.reconcile_stale.start",
      count: staleRecharges.length,
      cutoffDate: cutoffDate.toISOString(),
      timeoutMinutes,
    });

    for (const recharge of staleRecharges) {
      try {
        if (!recharge.razorpayOrderId) {
          await this.rechargeRepo.markExpired(
            recharge.id,
            "Missing Razorpay order ID — expired due to staleness",
          );
          result.reconciledExpiredCount++;
          continue;
        }

        const gatewayPayments = await this.payments.getOrderPayments(
          recharge.razorpayOrderId,
        );

        // 1. Check for captured payment
        const captured = gatewayPayments.find(
          (p) => p.captured && p.status === "captured",
        );
        if (captured) {
          await this.completePayment.execute({
            razorpayOrderId: recharge.razorpayOrderId,
            razorpayPaymentId: captured.id,
            razorpaySignature: "reconciled_stale_batch",
          });
          result.reconciledSuccessCount++;
          continue;
        }

        // 2. Check for authorized payment (attempt auto-capture)
        const authorized = gatewayPayments.find(
          (p) => p.status === "authorized",
        );
        if (authorized) {
          try {
            const capturedResult = await this.payments.capturePayment(
              authorized.id,
              recharge.amount,
              recharge.currency,
            );
            await this.completePayment.execute({
              razorpayOrderId: recharge.razorpayOrderId,
              razorpayPaymentId: capturedResult.id,
              razorpaySignature: "reconciled_stale_autocapture",
            });
            result.reconciledSuccessCount++;
            continue;
          } catch (captureErr) {
            this.logger.warn("Auto-capture of authorized payment failed during reconcile", {
              action: "payment.reconcile_stale.autocapture_failed",
              rechargeId: recharge.id,
              paymentId: authorized.id,
              error: captureErr,
            });
            result.skippedCount++;
            continue;
          }
        }

        // 3. Check if all payment attempts failed
        const failed = gatewayPayments.find((p) => p.status === "failed");
        if (failed && gatewayPayments.every((p) => p.status === "failed")) {
          const reason = `Gateway sync: payment ${failed.id} failed on Razorpay`;
          await this.rechargeRepo.markFailed(recharge.id, reason);
          result.reconciledFailedCount++;
          continue;
        }

        // 4. No payment attempts recorded (abandoned checkout)
        if (gatewayPayments.length === 0) {
          await this.rechargeRepo.markExpired(
            recharge.id,
            "Checkout abandoned — pending timeout exceeded",
          );
          result.reconciledExpiredCount++;
          continue;
        }

        // 5. In-flight / pending status
        result.skippedCount++;
      } catch (itemErr) {
        this.logger.error("Error reconciling stale recharge item", itemErr, {
          action: "payment.reconcile_stale.item_error",
          rechargeId: recharge.id,
          orderId: recharge.razorpayOrderId ?? undefined,
        });
        result.skippedCount++;
      }
    }

    this.logger.info("Completed stale payment reconciliation batch", {
      action: "payment.reconcile_stale.complete",
      ...result,
    });

    return result;
  }
}
