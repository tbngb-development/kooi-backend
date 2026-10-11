import type { InboundNumberRepository } from "../../interfaces/inbound-number-repository.interface";
import type {
  ListInboundNumbersFilters,
  InboundNumberListItemDTO,
} from "../../dto/inbound-number.dto";

export class ListInboundNumbersUseCase {
  constructor(private readonly repository: InboundNumberRepository) {}

  async execute(
    filters: ListInboundNumbersFilters,
  ): Promise<{ items: InboundNumberListItemDTO[]; total: number }> {
    return this.repository.list(filters);
  }
}
