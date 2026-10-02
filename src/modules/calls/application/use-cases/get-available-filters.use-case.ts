import type { CallRepository } from "../interfaces/call-repository.interface";
import type { AvailableFiltersResponse } from "../../../../shared/types/bolna.types";

export class GetAvailableFiltersUseCase {
  constructor(private readonly callRepo: CallRepository) {}

  async execute(
    tenantId: string,
    campaignId: string,
  ): Promise<AvailableFiltersResponse> {
    return this.callRepo.getAvailableFilters(tenantId, campaignId);
  }
}
