import type { BatchRepository } from "../interfaces/batch-repository.interface";
import {
  BatchNotFoundError,
  BatchNotDeletedError,
} from "../../domain/errors/batch.errors";

export class RestoreBatchUseCase {
  constructor(private readonly batchRepo: BatchRepository) {}

  async execute(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<void> {
    // Explicitly check for isDeleted: true
    const raw = await this.batchRepo.findById(tenantId, campaignId, batchId, {
      isDeleted: true,
    });
    if (!raw) throw new BatchNotFoundError();
    if (!raw.isDeleted) throw new BatchNotDeletedError();

    await this.batchRepo.restore(tenantId, campaignId, batchId);
  }
}
