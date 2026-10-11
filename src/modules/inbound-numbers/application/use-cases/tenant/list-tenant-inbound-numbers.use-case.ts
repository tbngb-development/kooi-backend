import type { InboundNumberRepository } from "../../interfaces/inbound-number-repository.interface";
import type {
  ListInboundNumbersFilters,
  InboundNumberListItemDTO,
} from "../../dto/inbound-number.dto";

export class ListTenantInboundNumbersUseCase {
  constructor(private readonly repository: InboundNumberRepository) {}

  async execute(
    tenantId: string,
    filters: Omit<ListInboundNumbersFilters, "tenantId">,
  ): Promise<{ items: InboundNumberListItemDTO[]; total: number }> {
    return this.repository.list({
      ...filters,
      tenantId,
    });
  }
}
