// modules/batches/application/use-cases/update-batch-name.use-case.ts

import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { LeadBatchEntityData } from "../../domain/entities/lead-batch.entity";
import type { UpdateBatchNameInput } from "../dto/batch.dto";
import { BatchNotFoundError, BatchOperationError } from "../../domain/errors/batch.errors";
import { CampaignNotFoundError } from "../../../campaigns/domain/errors/campaign.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { assertTenantNotFrozen } from "../../../../shared/utils/tenant-freeze.guard";

export class UpdateBatchNameUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo?: CampaignRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(input: UpdateBatchNameInput): Promise<LeadBatchEntityData> {
    await assertTenantNotFrozen(input.tenantId);

    const trimmedName = input.name?.trim();
    if (!trimmedName || trimmedName.length === 0) {
      throw new BatchOperationError("Batch name cannot be empty.");
    }

    if (trimmedName.length > 100) {
      throw new BatchOperationError("Batch name cannot exceed 100 characters.");
    }

    if (this.campaignRepo) {
      const campaign = await this.campaignRepo.findById(
        input.tenantId,
        input.campaignId,
      );
      if (!campaign) {
        throw new CampaignNotFoundError();
      }
    }

    const batch = await this.batchRepo.findById(
      input.tenantId,
      input.campaignId,
      input.batchId,
      { isDeleted: false },
    );

    if (!batch) {
      throw new BatchNotFoundError();
    }

    const updatedBatch = await this.batchRepo.update(input.batchId, {
      name: trimmedName,
    });

    this.logger?.info("Batch name updated by Admin", {
      action: "batch.admin.update_name",
      tenantId: input.tenantId,
      campaignId: input.campaignId,
      batchId: input.batchId,
      oldName: batch.name,
      newName: trimmedName,
    });

    return updatedBatch;
  }
}

