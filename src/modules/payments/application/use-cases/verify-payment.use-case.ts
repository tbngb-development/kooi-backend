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

/**
 * Client-side payment verification (tenant calls this after Razorpay checkout).
 * Validates the HMAC signature, then delegates to CompletePaymentUseCase.
 */
export class VerifyPaymentUseCase {
  constructor(
    private readonly payments: IPaymentProvider,
    private readonly rechargeRepo: RechargeRepository,
    private readonly completePayment: CompletePaymentUseCase,
  ) {}

  async execute(input: VerifyPaymentInput): Promise<CompletePaymentResult> {
    // 1. Find the recharge to get the order details
    const recharge = await this.rechargeRepo.findByRazorpayOrderId(
      input.razorpayOrderId,
    );
    if (!recharge) throw new RechargeNotFoundError(input.razorpayOrderId);

    // 2. Verify Razorpay HMAC signature
    const isValid = this.payments.verifySignature({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    });
    if (!isValid) throw new InvalidSignatureError();

    // 3. Delegate to CompletePayment (idempotent)
    return this.completePayment.execute(input);
  }
}
