import type { BatchRepository } from "../interfaces/batch-repository.interface";
import { BatchNotFoundError } from "../../domain/errors/batch.errors";

export class GetBatchStatsUseCase {
  constructor(private readonly batchRepo: BatchRepository) {}

  async execute(tenantId: string, campaignId: string, batchId: string) {
    const stats = await this.batchRepo.getStats(tenantId, campaignId, batchId);
    if (!stats) throw new BatchNotFoundError();
    return stats;
  }
}
