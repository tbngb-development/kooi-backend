import {
  type CallRepository,
  type CallCenterStatsResult,
} from "../interfaces/call-repository.interface";

export class GetCallCenterStatsUseCase {
  constructor(private readonly callRepo: CallRepository) {}

  async execute(tenantId: string): Promise<CallCenterStatsResult> {
    return this.callRepo.getCallCenterStats(tenantId);
  }
}
