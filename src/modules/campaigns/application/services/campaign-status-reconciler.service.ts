import type { BatchStatus, CampaignStatus } from "@prisma/client";
import { decideCampaignStatusFromBatches } from "../../domain/rules/campaign-lifecycle.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";

/**
 * The minimal persistence surface required to reconcile a campaign's status
 * from its batches. Implemented by the webhook repositories; the optional
 * atomic settle method is used in production and falls back to the plain
 * update where a repository does not expose it (keeps test doubles simple).
 */
export interface CampaignStatusReconciliationPort {
  getAllBatchStatuses(campaignId: string): Promise<BatchStatus[]>;

  markCampaignRunningIfActive(
    campaignId: string,
    startedAt?: Date,
  ): Promise<boolean>;

  updateCampaignStatus(
    campaignId: string,
    status: CampaignStatus,
    completedAt?: Date,
  ): Promise<void>;

  settleCampaignIfActive?(
    campaignId: string,
    status: "COMPLETED" | "FAILED",
    completedAt: Date,
  ): Promise<boolean>;
}

/**
 * Applies the shared campaign-status decision after a batch or call lifecycle
 * event. Every caller (Bolna call webhook, Bolna batch webhook, Sarvam
 * lifecycle, stats recalculation, credit enforcement) goes through here so
 * they cannot disagree about what "all work finished" means.
 *
 * No-reopen is enforced by the atomic guards in the repository, not by this
 * service: a late webhook can never move a finalized campaign back to
 * RUNNING, and a stale read cannot overwrite a concurrent finalization.
 */
export class CampaignStatusReconciler {
  constructor(
    private readonly port: CampaignStatusReconciliationPort,
    private readonly logger?: Logger,
  ) {}

  async reconcile(campaignId: string): Promise<boolean> {
    const statuses = await this.port.getAllBatchStatuses(campaignId);
    const decision = decideCampaignStatusFromBatches(statuses);

    if (decision.action === "none") {
      return false;
    }

    if (decision.action === "mark-running") {
      const started = await this.port.markCampaignRunningIfActive(
        campaignId,
        new Date(),
      );
      if (!started) {
        this.logger?.debug("Campaign start skipped by atomic guard", {
          action: "campaign.status.reconcile_start_skipped",
          campaignId,
        });
      }
      return started;
    }

    const completedAt = new Date();
    if (typeof this.port.settleCampaignIfActive === "function") {
      const settled = await this.port.settleCampaignIfActive(
        campaignId,
        decision.status,
        completedAt,
      );
      if (!settled) {
        this.logger?.debug("Campaign finalization skipped by atomic guard", {
          action: "campaign.status.reconcile_settle_skipped",
          campaignId,
          status: decision.status,
        });
      }
      return settled;
    }

    await this.port.updateCampaignStatus(campaignId, decision.status, completedAt);
    return true;
  }
}
