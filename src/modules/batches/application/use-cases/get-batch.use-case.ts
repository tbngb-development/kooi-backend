import type { BatchRepository } from "../interfaces/batch-repository.interface";
import { BatchNotFoundError } from "../../domain/errors/batch.errors";

export class GetBatchUseCase {
  constructor(private readonly batchRepo: BatchRepository) {}

  async execute(tenantId: string, campaignId: string, batchId: string) {
    const batch = await this.batchRepo.findByIdWithCounts(
      tenantId,
      campaignId,
      batchId,
    );
    if (!batch) throw new BatchNotFoundError();
    return batch;
  }
}
