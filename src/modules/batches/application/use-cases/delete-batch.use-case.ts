import type { BatchRepository } from "../interfaces/batch-repository.interface";
import {
  BatchNotFoundError,
  BatchActiveDeleteError,
} from "../../domain/errors/batch.errors";
import { isBatchActive } from "../../domain/entities/batch-status.rules";
import type { BolnaBatchProvider } from "../interfaces/bolna-batch-provider.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class DeleteBatchUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly bolnaProvider: BolnaBatchProvider,
    private readonly logger?: Logger,
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
        this.logger?.warn("Bolna delete batch error", {
          action: "batch.delete.bolna_error",
          tenantId,
          batchId,
          bolnaBatchId: batchData.bolnaBatchId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await this.batchRepo.delete(batchId);
    await this.batchRepo.recalculateCampaignStats(campaignId);

    this.logger?.info("Batch deleted", {
      action: "batch.delete",
      tenantId,
      campaignId,
      batchId,
    });

    return { message: "Batch deleted successfully" };
  }
}
