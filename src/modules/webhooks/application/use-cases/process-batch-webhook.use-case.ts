import { type WebhookRepository } from "../interfaces/webhook-repository.interface";
import { type WebhookBatchPayload } from "../dto/webhook.dto";
import { type BatchStatus } from "@prisma/client";
import { WebhookResolutionError } from "../../domain/errors/webhook.errors";
import type { CallLifecycleService } from "../services/call-lifecycle.service";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class ProcessBatchWebhookUseCase {
  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly callLifecycle?: CallLifecycleService,
    private readonly logger?: Logger,
  ) {}

  async execute(payload: WebhookBatchPayload): Promise<void> {
    const bolnaBatchId = payload.batch_id;

    const state = (payload.state ?? payload.status)?.toLowerCase();
    this.logger?.warn("batch webhook usecase payload state: ", { state });
    this.logger?.warn("batch webhook usecase payload: ", { payload });

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

    // Terminal state protection: preserve manual stops and terminal states locally
    if (leadBatch.status === "STOPPED" && newStatus === "COMPLETED") {
      return;
    }
    if (
      leadBatch.status === "COMPLETED" &&
      (newStatus === "RUNNING" || newStatus === "SCHEDULED")
    ) {
      return;
    }
    if (leadBatch.status === "FAILED") {
      return;
    }

    // Strict rule: batch status SCHEDULED is only set when user actually scheduled it
    if (newStatus === "SCHEDULED" && !leadBatch.scheduledAt) {
      return;
    }

    // Guard against premature batch completion from Bolna:
    // When Bolna sends 'completed', verify that active calls, active leads, and retries have finished.
    if (newStatus === "COMPLETED") {
      if (this.callLifecycle) {
        await this.callLifecycle.reconcileBatchCompletion(leadBatch.id);
        await this.callLifecycle.reconcileCampaignCompletion(leadBatch.campaignId);
      } else {
        const [activeLeads, activeCalls, hasPendingRetries] = await Promise.all([
          this.webhookRepo.countActiveLeadsInBatch(leadBatch.id),
          this.webhookRepo.countActiveCallsInBatch(leadBatch.id),
          this.webhookRepo.hasPendingRetriesInBatch(leadBatch.id),
        ]);
        if (activeLeads === 0 && activeCalls === 0 && !hasPendingRetries) {
          await this.webhookRepo.updateBatchStatus(
            leadBatch.id,
            "COMPLETED",
            new Date(),
          );
        }
      }
      return;
    }

    // 1. Update batch status for non-COMPLETED incoming states (e.g. RUNNING, STOPPED, FAILED)
    await this.webhookRepo.updateBatchStatus(leadBatch.id, newStatus);

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

    // 2. Authoritative campaign lifecycle reconciliation
    if (this.callLifecycle) {
      await this.callLifecycle.reconcileCampaignCompletion(leadBatch.campaignId);
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
