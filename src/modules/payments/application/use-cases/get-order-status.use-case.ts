import type { IPaymentProvider } from "../../../../shared/config/external/payments/payment-provider.interface";
import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import { RechargeNotFoundError } from "../../domain/errors/payment.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class GetOrderStatusUseCase {
  constructor(
    private readonly rechargeRepo: RechargeRepository,
    private readonly payments: IPaymentProvider,
    private readonly logger: Logger,
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
    const captured = payments.find(
      (p) => p.captured && p.status === "captured",
    );

    this.logger.debug("Order status checked with Razorpay", {
      action: "payment.get_order_status",
      orderId: razorpayOrderId,
      rechargeId: recharge.id,
      tenantId: recharge.tenantId,
      resolvedStatus: captured ? "SUCCESS" : recharge.status,
    });

    return {
      rechargeId: recharge.id,
      status: captured ? "SUCCESS" : recharge.status,
      amount: recharge.amount,
      purpose: recharge.purpose,
      razorpayPayments: payments,
    };
  }
}
