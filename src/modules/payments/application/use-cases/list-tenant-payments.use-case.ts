import type { RechargeRepository } from "../interfaces/recharge-repository.interface";
import type {
  ListTenantPaymentsQuery,
  PaginatedTenantPaymentsResponse,
} from "../dto/payment.dto";
import { toTenantPaymentResponse } from "../mappers/payment.mapper";

export class ListTenantPaymentsUseCase {
  constructor(private readonly rechargeRepo: RechargeRepository) {}

  async execute(
    tenantId: string,
    query: ListTenantPaymentsQuery,
  ): Promise<PaginatedTenantPaymentsResponse> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    const { items, total } = await this.rechargeRepo.listTenantRecharges(
      tenantId,
      {
        page,
        limit,
        status: query.status,
        purpose: query.purpose,
        search: query.search,
        startDate,
        endDate,
      },
    );

    return {
      items: items.map(toTenantPaymentResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

