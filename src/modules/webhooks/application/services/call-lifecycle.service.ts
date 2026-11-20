import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { CampaignStatusReconciler } from "../../../campaigns/application/services/campaign-status-reconciler.service";

export class CallLifecycleService {
  private readonly statusReconciler: CampaignStatusReconciler;

  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly logger?: Logger,
    statusReconciler?: CampaignStatusReconciler,
  ) {
    this.statusReconciler =
      statusReconciler ?? new CampaignStatusReconciler(webhookRepo, logger);
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
      const [activeLeads, activeCalls, hasPendingRetries] = await Promise.all([
        this.webhookRepo.countActiveLeadsInBatch(call.batchId),
        this.webhookRepo.countActiveCallsInBatch(call.batchId),
        this.webhookRepo.hasPendingRetriesInBatch(call.batchId),
      ]);
      if (activeLeads === 0 && activeCalls === 0 && !hasPendingRetries) {
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
      // All batch-based finalizers share one decision rule. A CREATED batch is
      // pending work, so a stale webhook can no longer finalize a campaign
      // while a newly added batch is waiting to run.
      await this.statusReconciler.reconcile(call.campaignId);
    } else {
      const [legacyActiveLeads, legacyActiveCalls] = await Promise.all([
        this.webhookRepo.countActiveLeadsInCampaignLegacy(call.campaignId),
        this.webhookRepo.countActiveCallsInCampaignLegacy(call.campaignId),
      ]);
      if (legacyActiveLeads === 0 && legacyActiveCalls === 0) {
        await this.webhookRepo.updateCampaignStatus(
          call.campaignId,
          "COMPLETED",
          new Date(),
        );
      }
    }
  }
}
