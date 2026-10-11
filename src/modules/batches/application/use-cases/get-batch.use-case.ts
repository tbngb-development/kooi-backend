import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { BatchDetailDTO } from "../dto/batch.dto";
import { BatchNotFoundError } from "../../domain/errors/batch.errors";

export class GetBatchUseCase {
  constructor(private readonly batchRepo: BatchRepository) {}

  async execute(
    tenantId: string,
    campaignId: string,
    batchId: string,
  ): Promise<BatchDetailDTO> {
    const batch = await this.batchRepo.findByIdWithDetail(
      tenantId,
      campaignId,
      batchId,
    );
    if (!batch) throw new BatchNotFoundError();
    return batch;
  }
}
