import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import type { PaymentSummaryResponse } from "../dto/payment.dto";

export class GetPaymentSummaryUseCase {
  constructor(private readonly rechargeRepo: RechargeRepository) {}

  async execute(tenantId: string): Promise<PaymentSummaryResponse> {
    return this.rechargeRepo.getSummary(tenantId);
  }
}