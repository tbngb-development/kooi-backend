import {
  type CallRepository,
  type CallStatsResult,
} from "../interfaces/call-repository.interface";

export interface GetCallStatsInput {
  tenantId: string;
  campaignId?: string;
  leadId?: string;
}

export class GetCallStatsUseCase {
  constructor(private readonly callRepo: CallRepository) {}

  async execute(input: GetCallStatsInput): Promise<CallStatsResult> {
    return this.callRepo.getStats(input.tenantId, {
      campaignId: input.campaignId,
      leadId: input.leadId,
    });
  }
}
