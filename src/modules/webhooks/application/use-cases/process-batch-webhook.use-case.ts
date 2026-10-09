import { type WebhookRepository } from "../interfaces/webhook-repository.interface";
import { type WebhookBatchPayload } from "../dto/webhook.dto";
import { type BatchStatus } from "@prisma/client";
import { WebhookResolutionError } from "../../domain/errors/webhook.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

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

    // Strict rule: batch status SCHEDULED is only set when user actually scheduled it
    if (newStatus === "SCHEDULED" && !leadBatch.scheduledAt) {
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

    // 3. Check if there are any batches actively dialing or queued
    const hasActiveBatches = statuses.some(
      (s) => s === "RUNNING" || s === "SCHEDULED" || s === "PROCESSING",
    );

    // 4. If no active batches remain, reconcile campaign status
    if (!hasActiveBatches) {
      // Ignore un-dialed "CREATED" batches; focus on batches that actually executed
      const executedBatches = statuses.filter((s) => s !== "CREATED");

      if (executedBatches.length > 0) {
        const allFailed = executedBatches.every((s) => s === "FAILED");
        const finalCampaignStatus = allFailed ? "FAILED" : "COMPLETED";

        await this.webhookRepo.updateCampaignStatus(
          leadBatch.campaignId,
          finalCampaignStatus,
          new Date(),
        );

        this.logger?.info("Campaign marked as finished from batch webhook", {
          action: "webhook.batch.campaign_completed",
          campaignId: leadBatch.campaignId,
          finalCampaignStatus,
        });
      }
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
