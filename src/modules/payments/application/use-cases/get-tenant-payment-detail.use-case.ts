import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import type { TenantPaymentResponse } from "../dto/payment.dto";
import { toTenantPaymentResponse } from "../mappers/payment.mapper";
import { RechargeNotFoundError } from "../../domain/errors/payment.errors";

export class GetTenantPaymentDetailUseCase {
  constructor(private readonly rechargeRepo: RechargeRepository) {}

  async execute(
    id: string,
    tenantId: string,
  ): Promise<TenantPaymentResponse> {
    const recharge = await this.rechargeRepo.findByIdAndTenantId(id, tenantId);
    if (!recharge) {
      throw new RechargeNotFoundError(id);
    }

    return toTenantPaymentResponse(recharge);
  }
}

