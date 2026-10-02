import { type LeadRepository, type LeadStatsResult } from "../interfaces/lead-repository.interface";

export class GetLeadStatsUseCase {
  constructor(private readonly leadRepo: LeadRepository) {}

  async execute(tenantId: string, campaignId?: string): Promise<LeadStatsResult> {
    return this.leadRepo.getStats(tenantId, campaignId);
  }
}