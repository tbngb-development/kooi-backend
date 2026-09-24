import type { BatchRepository } from "../interfaces/batch-repository.interface";
import {
  BatchNotFoundError,
  BatchActiveDeleteError,
} from "../../domain/errors/batch.errors";
import { isBatchActive } from "../../domain/entities/batch-status.rules";
import type { BolnaBatchProvider } from "../interfaces/bolna-batch-provider.interface";

export class DeleteBatchUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly bolnaProvider: BolnaBatchProvider,
  ) {}

  async execute(tenantId: string, campaignId: string, batchId: string) {
    const batchData = await this.batchRepo.findById(
      tenantId,
      campaignId,
      batchId,
    );
    if (!batchData) throw new BatchNotFoundError();
    if (isBatchActive(batchData.status)) throw new BatchActiveDeleteError();

    if (batchData.bolnaBatchId) {
      try {
        await this.bolnaProvider.deleteBatch(tenantId, batchData.bolnaBatchId);
      } catch (err) {
        console.warn("[DeleteBatch] Bolna delete error:", err);
      }
    }

    await this.batchRepo.delete(batchId);
    await this.batchRepo.recalculateCampaignStats(campaignId);

    return { message: "Batch deleted successfully" };
  }
}
