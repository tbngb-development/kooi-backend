import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import type { CompletePaymentUseCase } from "./complete-payment.use-case";
import { RechargeNotFoundError } from "../../domain/errors/payment.errors";
import type { CancelPaymentInput, CancelPaymentResult } from "../dto/payment.dto";
import type { Logger } from "../../../../shared/logging/logger.interface";

/**
 * Handles client checkout dismissal signal (modal.ondismiss / user abort).
 *
 * Security & Financial Guarantees:
 *  - Enforces tenant isolation (order must belong to requesting tenant).
 *  - Never blindly trusts frontend dismissal: verifies gateway state first.
 *  - If payment is captured on Razorpay, fulfills as SUCCESS and credits wallet.
 *  - If payment is in-flight (authorized/pending), retains INITIATED.
 *  - If unattempted or failed, transitions INITIATED -> CANCELLED.
 *  - Safe against duplicate calls and concurrent completion.
 */
export class CancelPaymentUseCase {
  constructor(
    private readonly rechargeRepo: RechargeRepository,
    private readonly payments: IPaymentProvider,
    private readonly completePayment: CompletePaymentUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(input: CancelPaymentInput): Promise<CancelPaymentResult> {
    const recharge = await this.rechargeRepo.findByRazorpayOrderId(
      input.razorpayOrderId,
    );
    if (!recharge) {
      throw new RechargeNotFoundError(input.razorpayOrderId);
    }

    // Tenant isolation verification
    if (input.tenantId && recharge.tenantId !== input.tenantId) {
      this.logger.warn("Payment cancellation — tenant mismatch", {
        action: "payment.cancel.tenant_mismatch",
        orderId: input.razorpayOrderId,
        expectedTenantId: input.tenantId,
        actualTenantId: recharge.tenantId,
      });
      throw new RechargeNotFoundError(input.razorpayOrderId);
    }

    // Fast-path: already reached terminal/settled status
    if (recharge.status === "SUCCESS") {
      return {
        rechargeId: recharge.id,
        status: "SUCCESS",
        message: "Payment is already marked as SUCCESS and credited.",
        alreadyProcessed: true,
        razorpayPaymentId: recharge.razorpayPaymentId ?? null,
      };
    }

    if (
      recharge.status === "CANCELLED" ||
      recharge.status === "EXPIRED" ||
      recharge.status === "REFUNDED"
    ) {
      return {
        rechargeId: recharge.id,
        status: recharge.status,
        message: `Payment checkout is already ${recharge.status.toLowerCase()}.`,
        alreadyProcessed: true,
      };
    }

    if (!recharge.razorpayOrderId) {
      const reason = input.reason || "Checkout cancelled (missing order ID)";
      const updated = await this.rechargeRepo.markCancelled(
        recharge.id,
        reason,
      );
      return {
        rechargeId: recharge.id,
        status: updated ? "CANCELLED" : recharge.status,
        message: "Checkout cancelled.",
      };
    }

    const orderId = recharge.razorpayOrderId;

    // Authoritative check with Razorpay gateway
    const payments = await this.payments.getOrderPayments(orderId);

    // 1. Captured payment exists on gateway
    const captured = payments.find(
      (p) => p.captured && p.status === "captured",
    );
    if (captured) {
      await this.completePayment.execute({
        razorpayOrderId: orderId,
        razorpayPaymentId: captured.id,
        razorpaySignature: "verified_on_cancel_dismissal",
      });

      this.logger.info(
        "Payment verified and credited on dismissal signal (gateway captured)",
        {
          action: "payment.cancel.fulfilled_success",
          rechargeId: recharge.id,
          orderId,
          paymentId: captured.id,
          tenantId: recharge.tenantId,
        },
      );

      return {
        rechargeId: recharge.id,
        status: "SUCCESS",
        message: "Payment was captured on gateway; credited successfully.",
        razorpayPaymentId: captured.id,
      };
    }

    // 2. In-flight payment attempt (e.g. authorized or pending OTP/TPAP)
    const inFlight = payments.find(
      (p) => p.status === "authorized" || p.status === "pending",
    );
    if (inFlight) {
      this.logger.info("Payment attempt in-flight during dismissal signal", {
        action: "payment.cancel.retained_in_flight",
        rechargeId: recharge.id,
        orderId,
        paymentId: inFlight.id,
        gatewayStatus: inFlight.status,
      });

      return {
        rechargeId: recharge.id,
        status: "INITIATED",
        message:
          "Payment attempt is still in-flight on gateway. Retaining pending status.",
        razorpayPaymentId: inFlight.id,
      };
    }

    // 3. No successful or in-flight attempts: mark as CANCELLED
    const reason = input.reason || "Checkout dismissed by user";
    const updated = await this.rechargeRepo.markCancelled(recharge.id, reason);

    this.logger.info("Payment marked as CANCELLED upon checkout dismissal", {
      action: "payment.cancel.marked_cancelled",
      rechargeId: recharge.id,
      orderId,
      tenantId: recharge.tenantId,
      reason,
      attemptsCount: payments.length,
    });

    return {
      rechargeId: recharge.id,
      status: updated ? "CANCELLED" : recharge.status,
      message: "Checkout cancelled by user.",
    };
  }
}
