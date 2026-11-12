import type { BatchRepository } from "../interfaces/batch-repository.interface";
import type { CampaignRepository } from "../../../campaigns/application/interfaces/campaign-repository.interface";
import type { ISarvamCohortClient } from "../interfaces/sarvam-cohort-client.interface";
import type { ISarvamApiKeyEncryptionService } from "../../../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";
import type { BatchDetailDTO } from "../dto/batch.dto";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { BatchNotFoundError } from "../../domain/errors/batch.errors";

export class GetBatchUseCase {
  constructor(
    private readonly batchRepo: BatchRepository,
    private readonly campaignRepo?: CampaignRepository,
    private readonly sarvamCohortClient?: ISarvamCohortClient,
    private readonly sarvamEncryptionService?: ISarvamApiKeyEncryptionService,
    private readonly logger?: Logger,
  ) {}

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

    if (
      batch.provider === "SARVAM" &&
      batch.status === "PROCESSING" &&
      batch.sarvamCohortId &&
      this.sarvamCohortClient &&
      this.sarvamEncryptionService &&
      this.campaignRepo
    ) {
      try {
        const campaign = await this.campaignRepo.findByIdWithRelations(
          tenantId,
          campaignId,
        );
        if (campaign?.sarvamCampaignId && campaign?.sarvamAgentId) {
          const sarvamAgent = await this.campaignRepo.findSarvamAgentWithApiKey(
            tenantId,
            campaign.sarvamAgentId,
          );
          if (sarvamAgent) {
            const decryptedApiKey = this.sarvamEncryptionService.decrypt(
              sarvamAgent.apiKey.apiKeyEncrypted,
            );
            const cohortInfo = await this.sarvamCohortClient.getCohort({
              organizationId: sarvamAgent.apiKey.organizationId,
              workspaceId: sarvamAgent.apiKey.workspaceId,
              campaignId: campaign.sarvamCampaignId,
              cohortId: batch.sarvamCohortId,
              apiKey: decryptedApiKey,
            });

            if (
              cohortInfo.status === "completed" ||
              cohortInfo.status === "failed"
            ) {
              const newStatus =
                cohortInfo.status === "completed"
                  ? campaign.status === "RUNNING"
                    ? "RUNNING"
                    : "SCHEDULED"
                  : "FAILED";
              await this.batchRepo.update(batchId, { status: newStatus });
              await this.batchRepo.recalculateCampaignStats(campaignId);
              batch.status = newStatus;
            }
          }
        }
      } catch (err) {
        this.logger?.warn("Failed to reconcile Sarvam cohort status on get", {
          batchId,
          error: (err as Error).message,
        });
      }
    }

    return batch;
  }
}
