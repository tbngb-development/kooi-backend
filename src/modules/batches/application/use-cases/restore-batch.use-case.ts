// modules/batches/application/use-cases/restore-batch.use-case.ts

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
    const raw = await this.batchRepo.findById(tenantId, campaignId, batchId, {
      includeDeleted: true,
    });
    if (!raw) throw new BatchNotFoundError();
    if (!raw.isDeleted) throw new BatchNotDeletedError();

    await this.batchRepo.restore(tenantId, campaignId, batchId);
  }
}