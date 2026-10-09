// modules/campaigns/application/use-cases/update-campaign-status.use-case.ts

import type { CampaignStatus } from "@prisma/client";
import type { CampaignRepository } from "../interfaces/campaign-repository.interface";
import type { BatchRepository } from "../../../batches/application/interfaces/batch-repository.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { CampaignNotFoundError } from "../../domain/errors/campaign.errors";
import type { CampaignEntityData } from "../../domain/entities/campaign.entity";

export interface UpdateCampaignStatusInput {
  tenantId: string;
  campaignId: string;
  status: CampaignStatus;
  cascadeToBatches?: boolean;
}

export class UpdateCampaignStatusUseCase {
  constructor(
    private readonly campaignRepo: CampaignRepository,
    private readonly batchRepo: BatchRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(input: UpdateCampaignStatusInput): Promise<CampaignEntityData> {
    const { tenantId, campaignId, status, cascadeToBatches = true } = input;

    // 1. Validate campaign exists under tenant
    const campaign = await this.campaignRepo.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError();
    }

    // 2. Prepare timestamp updates
    const extra: { startedAt?: Date; completedAt?: Date } = {};
    if (status === "RUNNING") {
      extra.startedAt = campaign.startedAt ?? new Date();
    } else if (status === "COMPLETED" || status === "FAILED") {
      extra.completedAt = new Date();
    }

    // 3. Cascade to active batches if requested
    let cascadedBatchesCount = 0;
    if (cascadeToBatches) {
      if (status === "COMPLETED") {
        cascadedBatchesCount = await this.batchRepo.cascadeStatusFromCampaign(
          campaignId,
          "COMPLETED",
        );
      } else if (status === "FAILED") {
        cascadedBatchesCount = await this.batchRepo.cascadeStatusFromCampaign(
          campaignId,
          "FAILED",
        );
      } else if (status === "DRAFT") {
        cascadedBatchesCount = await this.batchRepo.cascadeStatusFromCampaign(
          campaignId,
          "STOPPED",
        );
      }
    }

    // 4. Update the campaign status
    const updated = await this.campaignRepo.updateStatus(
      campaignId,
      status,
      extra,
    );

    // 5. Ensure stats & totals are synchronized
    try {
      await this.batchRepo.recalculateCampaignStats(campaignId);
    } catch (err) {
      this.logger?.warn("Failed to recalculate campaign stats after manual status update", {
        campaignId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.logger?.info("Campaign status updated manually by Admin", {
      action: "campaign.status.admin_update",
      tenantId,
      campaignId,
      previousStatus: campaign.status,
      newStatus: status,
      cascadeToBatches,
      cascadedBatchesCount,
    });

    return updated;
  }
}
