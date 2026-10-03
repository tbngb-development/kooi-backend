// modules/batches/application/use-cases/archive-batch.use-case.ts

import type { BatchRepository } from "../interfaces/batch-repository.interface";
import { LeadBatchEntity } from "../../domain/entities/lead-batch.entity";
import {
  BatchNotFoundError,
  BatchAlreadyDeletedError,
  BatchNotArchivableError,
} from "../../domain/errors/batch.errors";

export class ArchiveBatchUseCase {
  constructor(private readonly batchRepo: BatchRepository) {}

  async execute(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<void> {
    const raw = await this.batchRepo.findById(tenantId, campaignId, batchId);
    if (!raw) throw new BatchNotFoundError();

    const batch = new LeadBatchEntity(raw);
    if (batch.isDeleted) throw new BatchAlreadyDeletedError();
    if (!batch.isArchivable) throw new BatchNotArchivableError(batch.status);

    await this.batchRepo.softDelete(tenantId, campaignId, batchId);
  }
}
