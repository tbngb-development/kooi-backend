import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import { RechargeNotFoundError } from "../../domain/errors/payment.errors";

export class GetOrderStatusUseCase {
  constructor(
    private readonly rechargeRepo: RechargeRepository,
    private readonly payments: IPaymentProvider,
  ) {}

  async execute(razorpayOrderId: string) {
    const recharge =
      await this.rechargeRepo.findByRazorpayOrderId(razorpayOrderId);
    if (!recharge) throw new RechargeNotFoundError(razorpayOrderId);

    // If already terminal, return cached status
    if (recharge.status === "SUCCESS" || recharge.status === "FAILED") {
      return {
        rechargeId: recharge.id,
        status: recharge.status,
        amount: recharge.amount,
        purpose: recharge.purpose,
      };
    }

    // Otherwise, check with Razorpay
    const payments = await this.payments.getOrderPayments(razorpayOrderId);
    const captured = payments.find((p) => p.captured && p.status === "captured");

    return {
      rechargeId: recharge.id,
      status: captured ? "SUCCESS" : recharge.status,
      amount: recharge.amount,
      purpose: recharge.purpose,
      razorpayPayments: payments,
    };
  }
}