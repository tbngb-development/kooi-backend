import { type WebhookRepository } from "../interfaces/webhook-repository.interface";
import { type WebhookBatchPayload } from "../dto/webhook.dto";
import { type BatchStatus } from "@prisma/client";
import { WebhookResolutionError } from "../../domain/errors/webhook.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { evaluateCampaignStatusFromBatches } from "../../../campaigns/domain/rules/campaign-lifecycle.rules";

export class ProcessBatchWebhookUseCase {
  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(payload: WebhookBatchPayload): Promise<void> {
    const bolnaBatchId = payload.batch_id;

    const state = (payload.state ?? payload.status)?.toLowerCase();
    if (!state) return;

    if (!bolnaBatchId) {
      throw new WebhookResolutionError("Missing batch_id context.");
    }

    const leadBatch =
      await this.webhookRepo.findBatchIdByBolnaBatchId(bolnaBatchId);
    if (!leadBatch) return;

    const stateMap: Record<string, BatchStatus> = {
      completed: "COMPLETED",
      stopped: "STOPPED",
      failed: "FAILED",
      running: "RUNNING",
      scheduled: "SCHEDULED",
    };

    const newStatus = stateMap[state];
    if (!newStatus) return;

    // Preserve manual stops locally to allow Resume creation
    if (leadBatch.status === "STOPPED" && newStatus === "COMPLETED") {
      return;
    }

    // 1. Update this specific batch status
    await this.webhookRepo.updateBatchStatus(
      leadBatch.id,
      newStatus,
      newStatus === "COMPLETED" ? new Date() : undefined,
    );

    // 2. Fetch all batch statuses in this campaign
    const statuses = await this.webhookRepo.getAllBatchStatuses(
      leadBatch.campaignId,
    );

    // 3. Reconcile campaign status via domain lifecycle rules
    const targetStatus = evaluateCampaignStatusFromBatches(statuses);

    if (targetStatus && targetStatus !== "RUNNING") {
      await this.webhookRepo.updateCampaignStatus(
        leadBatch.campaignId,
        targetStatus,
        new Date(),
      );

      this.logger?.info("Campaign marked as finished from batch webhook", {
        action: "webhook.batch.campaign_completed",
        campaignId: leadBatch.campaignId,
        finalCampaignStatus: targetStatus,
      });
    }

    this.logger?.info("Batch webhook processed", {
      action: "webhook.batch.processed",
      bolnaBatchId,
      batchId: leadBatch.id,
      campaignId: leadBatch.campaignId,
      newStatus,
    });
  }
}
