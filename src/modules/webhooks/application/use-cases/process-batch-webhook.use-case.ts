import { type WebhookRepository } from "../interfaces/webhook-repository.interface";
import { type WebhookBatchPayload } from "../dto/webhook.dto";
import { type BatchStatus } from "@prisma/client";
import { WebhookResolutionError } from "../../domain/errors/webhook.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { CampaignStatusReconciler } from "../../../campaigns/application/services/campaign-status-reconciler.service";

export class ProcessBatchWebhookUseCase {
  private readonly statusReconciler: CampaignStatusReconciler;

  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly logger?: Logger,
    statusReconciler?: CampaignStatusReconciler,
  ) {
    this.statusReconciler =
      statusReconciler ?? new CampaignStatusReconciler(webhookRepo, logger);
  }

  async execute(payload: WebhookBatchPayload): Promise<void> {
    const bolnaBatchId = payload.batch_id;

    const state = (payload.state ?? payload.status)?.toLowerCase();
    this.logger?.warn("batch webhook usecase payload state: ", {state})

    this.logger?.warn("batch webhook usecase payload: ", {payload})
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

    // If batch was stopped by Bolna, synchronize remaining calls and leads to STOPPED
    if (newStatus === "STOPPED") {
      try {
        const { stoppedCalls, stoppedLeads } =
          await this.webhookRepo.stopBatchCallsAndLeads(leadBatch.id, "MANUAL");
        this.logger?.info("Batch calls and leads marked as stopped from webhook", {
          action: "webhook.batch.calls_and_leads_stopped",
          batchId: leadBatch.id,
          stoppedCalls,
          stoppedLeads,
        });
      } catch (err) {
        this.logger?.error(
          "Failed to mark batch calls and leads as stopped from webhook",
          err,
          { batchId: leadBatch.id },
        );
      }
    }

    // 2. Reconcile campaign status from all batches using the shared rule.
    // The atomic settle guard keeps terminal campaigns untouched on late webhooks.
    await this.statusReconciler.reconcile(leadBatch.campaignId);

    this.logger?.info("Batch webhook processed", {
      action: "webhook.batch.processed",
      bolnaBatchId,
      batchId: leadBatch.id,
      campaignId: leadBatch.campaignId,
      newStatus,
    });
  }
}
