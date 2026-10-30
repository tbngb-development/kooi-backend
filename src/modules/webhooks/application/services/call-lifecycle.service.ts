import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import { evaluateCampaignStatusFromBatches } from "../../../campaigns/domain/rules/campaign-lifecycle.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class CallLifecycleService {
  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * Reconciles whether a batch has finished all work and retries.
   * Updates batch status to COMPLETED if and only if no active calls,
   * active leads, or pending retries remain.
   *
   * @returns true if the batch completed, false if work remains.
   */
  async reconcileBatchCompletion(batchId: string): Promise<boolean> {
    const [activeLeads, activeCalls, hasPendingRetries] = await Promise.all([
      this.webhookRepo.countActiveLeadsInBatch(batchId),
      this.webhookRepo.countActiveCallsInBatch(batchId),
      this.webhookRepo.hasPendingRetriesInBatch(batchId),
    ]);

    if (activeLeads === 0 && activeCalls === 0 && !hasPendingRetries) {
      await this.webhookRepo.updateBatchStatus(
        batchId,
        "COMPLETED",
        new Date(),
      );

      this.logger?.info("Batch marked as COMPLETED from lifecycle reconciliation", {
        action: "webhook.batch.completed",
        batchId,
      });
      return true;
    }

    this.logger?.debug("Batch completion deferred - work remaining", {
      action: "webhook.batch.completion_deferred",
      batchId,
      activeLeads,
      activeCalls,
      hasPendingRetries,
    });
    return false;
  }

  /**
   * Authoritative campaign-completion decision path.
   * Evaluates all batches belonging to the campaign using evaluateCampaignStatusFromBatches.
   * Guarantees that:
   * 1. Unstarted (CREATED) batches prevent premature completion.
   * 2. No batch is RUNNING, SCHEDULED, or PROCESSING.
   * 3. No batch contains active calls, active leads, or pending retries.
   */
  async reconcileCampaignCompletion(campaignId: string): Promise<void> {
    const batches = await this.webhookRepo.getBatchesByCampaignId(campaignId);

    if (batches.length > 0) {
      const statuses = batches.map((b) => b.status);
      const targetStatus = evaluateCampaignStatusFromBatches(statuses);

      // If the domain rule evaluates to RUNNING (e.g. active batches, or unstarted CREATED batches remain)
      if (targetStatus === "RUNNING") {
        return;
      }

      if (targetStatus === "COMPLETED" || targetStatus === "FAILED") {
        // Confirm that NO batch contains pending calls, active leads, or pending retries
        for (const batch of batches) {
          const [activeLeads, activeCalls, hasPendingRetries] = await Promise.all([
            this.webhookRepo.countActiveLeadsInBatch(batch.id),
            this.webhookRepo.countActiveCallsInBatch(batch.id),
            this.webhookRepo.hasPendingRetriesInBatch(batch.id),
          ]);
          if (activeLeads > 0 || activeCalls > 0 || hasPendingRetries) {
            this.logger?.debug("Campaign completion deferred - batch has unfinished work", {
              action: "webhook.campaign.completion_deferred",
              campaignId,
              batchId: batch.id,
              activeLeads,
              activeCalls,
              hasPendingRetries,
            });
            return;
          }
        }

        await this.webhookRepo.updateCampaignStatus(
          campaignId,
          targetStatus,
          new Date(),
        );

        this.logger?.info("Campaign marked as finished from lifecycle reconciliation", {
          action: "webhook.campaign.finished",
          campaignId,
          finalCampaignStatus: targetStatus,
        });
      }
    } else {
      const [legacyActiveLeads, legacyActiveCalls] = await Promise.all([
        this.webhookRepo.countActiveLeadsInCampaignLegacy(campaignId),
        this.webhookRepo.countActiveCallsInCampaignLegacy(campaignId),
      ]);
      if (legacyActiveLeads === 0 && legacyActiveCalls === 0) {
        await this.webhookRepo.updateCampaignStatus(
          campaignId,
          "COMPLETED",
          new Date(),
        );
      }
    }
  }

  /**
   * Reconciles batch and campaign completion states after a terminal call event.
   */
  async checkBatchAndCampaignCompletion(
    call: ResolvedCallContext,
  ): Promise<void> {
    if (!call.campaignId) {
      return;
    }

    if (call.batchId) {
      await this.reconcileBatchCompletion(call.batchId);
    }

    await this.reconcileCampaignCompletion(call.campaignId);
  }
}
