import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class CallLifecycleService {
  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * Reconciles batch and campaign completion states after a terminal call event.
   */
  async checkBatchAndCampaignCompletion(
    call: ResolvedCallContext,
  ): Promise<void> {
    if (call.batchId) {
      const activeLeads = await this.webhookRepo.countActiveLeadsInBatch(
        call.batchId,
      );
      if (activeLeads === 0) {
        await this.webhookRepo.updateBatchStatus(
          call.batchId,
          "COMPLETED",
          new Date(),
        );
      }
    }

    const statuses = await this.webhookRepo.getAllBatchStatuses(
      call.campaignId,
    );

    if (statuses.length > 0) {
      // Ensure unstarted/draft "CREATED" batches never block campaign completion.
      // Reconciles status based on whether any active dialing/scheduling is in progress.
      const hasActiveBatches = statuses.some(
        (s) => s === "RUNNING" || s === "SCHEDULED" || s === "PROCESSING",
      );

      if (!hasActiveBatches) {
        const executedBatches = statuses.filter((s) => s !== "CREATED");

        if (executedBatches.length > 0) {
          const allFailed = executedBatches.every((s) => s === "FAILED");
          const finalCampaignStatus = allFailed ? "FAILED" : "COMPLETED";

          await this.webhookRepo.updateCampaignStatus(
            call.campaignId,
            finalCampaignStatus,
            new Date(),
          );

          this.logger?.info("Campaign marked as finished from call webhook", {
            action: "webhook.call.campaign_completed",
            campaignId: call.campaignId,
            finalCampaignStatus,
          });
        }
      }
    } else {
      const legacyActive =
        await this.webhookRepo.countActiveLeadsInCampaignLegacy(
          call.campaignId,
        );
      if (legacyActive === 0) {
        await this.webhookRepo.updateCampaignStatus(
          call.campaignId,
          "COMPLETED",
          new Date(),
        );
      }
    }
  }
}
