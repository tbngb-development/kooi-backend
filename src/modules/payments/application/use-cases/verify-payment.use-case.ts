import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import type { CompletePaymentUseCase } from "./complete-payment.use-case";
import {
  InvalidSignatureError,
  RechargeNotFoundError,
} from "../../domain/errors/payment.errors";
import type {
  VerifyPaymentInput,
  CompletePaymentResult,
} from "../dto/payment.dto";
import type { Logger } from "../../../../shared/logging/logger.interface";

/**
 * Client-side payment verification (tenant calls this after Razorpay checkout).
 * Validates the HMAC signature, then delegates to CompletePaymentUseCase.
 */
export class VerifyPaymentUseCase {
  constructor(
    private readonly payments: IPaymentProvider,
    private readonly rechargeRepo: RechargeRepository,
    private readonly completePayment: CompletePaymentUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(
    input: VerifyPaymentInput,
    tenantId?: string,
  ): Promise<CompletePaymentResult> {
    // 1. Find the recharge to get the order details
    const recharge = await this.rechargeRepo.findByRazorpayOrderId(
      input.razorpayOrderId,
    );
    if (!recharge) throw new RechargeNotFoundError(input.razorpayOrderId);

    // 2. Verify the order belongs to the authenticated tenant
    if (tenantId && recharge.tenantId !== tenantId) {
      this.logger?.warn("Payment verification — tenant mismatch", {
        action: "payment.verify.tenant_mismatch",
        orderId: input.razorpayOrderId,
        expectedTenantId: tenantId,
        actualTenantId: recharge.tenantId,
      });
      throw new RechargeNotFoundError(input.razorpayOrderId);
    }

    // 2. Verify Razorpay HMAC signature
    const isValid = this.payments.verifySignature({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    });
    if (!isValid) {
      this.logger.warn("Payment signature verification failed", {
        action: "payment.verify",
        orderId: input.razorpayOrderId,
        tenantId: recharge.tenantId,
      });
      throw new InvalidSignatureError();
    }

    this.logger.info("Payment signature verified", {
      action: "payment.verify",
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      tenantId: recharge.tenantId,
    });

    // 3. Delegate to CompletePayment (idempotent)
    return this.completePayment.execute(input);
  }
}
