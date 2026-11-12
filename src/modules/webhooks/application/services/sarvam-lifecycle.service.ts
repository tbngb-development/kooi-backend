import type { BatchStatus, CampaignStatus, CallStatus } from "@prisma/client";
import type {
  ISarvamWebhookRepository,
  SarvamAttemptHistoryEntry,
} from "../interfaces/sarvam-webhook-repository.interface";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface ReconcileSarvamLifecycleInput {
  tenantId: string;
  campaignId: string;
  batchId: string;
  leadId: string;
}

export class SarvamLifecycleService {
  constructor(
    private readonly repo: ISarvamWebhookRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * Reconciles batch and campaign lifecycle after a call attempt has been recorded.
   */
  async reconcileAfterCall(input: ReconcileSarvamLifecycleInput): Promise<void> {
    const { campaignId, batchId } = input;

    if (typeof this.repo.getBatchWithRetryConfig !== "function") {
      return;
    }

    // 1. Fetch batch state and retry configuration
    const batch = await this.repo.getBatchWithRetryConfig(batchId);
    if (!batch) {
      this.logger?.warn("Batch not found during Sarvam lifecycle reconciliation", {
        action: "sarvam_lifecycle.batch_not_found",
        batchId,
      });
      return;
    }

    const campaignStatus = batch.campaign?.status;
    const isCampaignExpired = Boolean(
      batch.campaign?.endTimestamp &&
        new Date().getTime() >= new Date(batch.campaign.endTimestamp).getTime(),
    );
    const isCampaignTerminal =
      campaignStatus === "COMPLETED" ||
      campaignStatus === "CANCELLED" ||
      campaignStatus === "FAILED";

    const isCampaignTerminalOrPaused =
      isCampaignTerminal ||
      campaignStatus === "PAUSED" ||
      isCampaignExpired;

    const isBatchTerminal =
      batch.status === "COMPLETED" ||
      batch.status === "STOPPED" ||
      batch.status === "FAILED";

    // 2. Ensure in-progress state if batch is CREATED, SCHEDULED, or PROCESSING
    // Do NOT reactivate paused, completed, cancelled, or expired campaigns, or terminal batches!
    if (
      batch.status === "CREATED" ||
      batch.status === "SCHEDULED" ||
      batch.status === "PROCESSING"
    ) {
      if (!isCampaignTerminalOrPaused) {
        await this.repo.updateBatchStatus(batchId, "RUNNING");
        await this.repo.updateCampaignStatus(campaignId, "RUNNING");
      }
    }

    // 3. Inspect active work in the batch
    const [activeLeads, activeCalls, callsInBatch] = await Promise.all([
      this.repo.countActiveLeadsInBatch(batchId),
      this.repo.countActiveCallsInBatch(batchId),
      this.repo.getCallsInBatch(batchId),
    ]);

    // Check if any call has pending retries remaining (only if campaign is not expired)
    const pendingRetries =
      !isCampaignExpired &&
      this.hasPendingRetries(callsInBatch);

    // If calls are still active in telephony, allow them to finish
    if (activeCalls > 0) {
      return;
    }

    // If campaign is expired or completed/cancelled/failed, or if batch was already STOPPED or COMPLETED, and all active calls are done:
    const isCampaignTerminalOrExpired =
      isCampaignExpired || isCampaignTerminal;

    if (isCampaignTerminalOrExpired || isBatchTerminal) {
      if (isBatchTerminal) {
        // Late webhooks on an already-terminal batch: do not mutate batch status
        try {
          await this.repo.recalculateCampaignStats(campaignId);
        } catch (statsErr) {
          this.logger?.warn("Failed to recalculate campaign stats", {
            action: "sarvam_lifecycle.stats_recalc_error",
            campaignId,
            error:
              statsErr instanceof Error ? statsErr.message : String(statsErr),
          });
        }
        return;
      }
      // Check if any leads in this batch are in STOPPED state
      const stoppedLeadsCount =
        typeof this.repo.countStoppedLeadsInBatch === "function"
          ? await this.repo.countStoppedLeadsInBatch(batchId)
          : 0;

      const hasUnfinishedWork =
        activeLeads > 0 ||
        pendingRetries ||
        stoppedLeadsCount > 0 ||
        batch.status === "STOPPED";

      if (hasUnfinishedWork) {
        if (
          activeLeads > 0 &&
          typeof this.repo.markPendingLeadsAsStopped === "function"
        ) {
          try {
            await this.repo.markPendingLeadsAsStopped(batchId, "MANUAL");
          } catch (stopErr) {
            this.logger?.warn("Failed to mark pending leads as stopped", {
              action: "sarvam_lifecycle.mark_leads_stopped_error",
              batchId,
              error:
                stopErr instanceof Error ? stopErr.message : String(stopErr),
            });
          }
        }
        // Batch has uncalled or stopped leads: keep/set status to STOPPED (never COMPLETED)
        if (batch.status !== "STOPPED") {
          await this.repo.updateBatchStatus(batchId, "STOPPED", new Date());
          this.logger?.info(
            "Sarvam batch marked as STOPPED due to campaign expiration/termination with unfinished leads",
            {
              action: "sarvam_lifecycle.batch_stopped",
              batchId,
              activeLeads,
              stoppedLeadsCount,
            },
          );
        }
      } else {
        // 100% of leads were genuinely dialed without any stopped leads
        const totalCalls = callsInBatch.length;
        const allFailed =
          totalCalls > 0 && callsInBatch.every((c) => c.status === "FAILED");
        const finalBatchStatus: BatchStatus = allFailed ? "FAILED" : "COMPLETED";

        await this.repo.updateBatchStatus(batchId, finalBatchStatus, new Date());
        this.logger?.info("Sarvam batch marked as finished", {
          action: "sarvam_lifecycle.batch_finished",
          batchId,
          finalBatchStatus,
          totalCalls,
        });
      }

      // Reconcile stats without overwriting terminal or paused campaign status
      try {
        await this.repo.recalculateCampaignStats(campaignId);
      } catch (statsErr) {
        this.logger?.warn("Failed to recalculate campaign stats", {
          action: "sarvam_lifecycle.stats_recalc_error",
          campaignId,
          error:
            statsErr instanceof Error ? statsErr.message : String(statsErr),
        });
      }
      return;
    }

    // If campaign is still active and there is active work or pending retries, batch remains RUNNING
    if (activeLeads > 0 || pendingRetries) {
      return;
    }

    // 4. Batch is complete: determine final batch status
    // Rule: If 100% of calls ended in FAILED, mark FAILED; otherwise COMPLETED
    const totalCalls = callsInBatch.length;
    const allFailed =
      totalCalls > 0 && callsInBatch.every((c) => c.status === "FAILED");
    const finalBatchStatus: BatchStatus = allFailed ? "FAILED" : "COMPLETED";

    await this.repo.updateBatchStatus(batchId, finalBatchStatus, new Date());
    this.logger?.info("Sarvam batch marked as finished", {
      action: "sarvam_lifecycle.batch_finished",
      batchId,
      finalBatchStatus,
      totalCalls,
    });

    // 5. Reconcile Campaign lifecycle across all its batches
    const allBatchStatuses = await this.repo.getAllBatchStatuses(campaignId);
    if (allBatchStatuses.length === 0) {
      return;
    }

    // Check if any active batches remain (RUNNING, SCHEDULED, PROCESSING)
    const hasActiveBatches = allBatchStatuses.some(
      (s) => s === "RUNNING" || s === "SCHEDULED" || s === "PROCESSING",
    );

    if (hasActiveBatches) {
      return;
    }

    // Filter out unstarted CREATED batches if any exist
    const executedBatches = allBatchStatuses.filter((s) => s !== "CREATED");
    if (executedBatches.length > 0) {
      // Note: CANCELLED, COMPLETED, and expired campaigns are already returned early above
      const allBatchesFailed = executedBatches.every((s) => s === "FAILED");
      const finalCampaignStatus: CampaignStatus = allBatchesFailed
        ? "FAILED"
        : "COMPLETED";

      await this.repo.updateCampaignStatus(
        campaignId,
        finalCampaignStatus,
        new Date(),
      );

      this.logger?.info("Sarvam campaign marked as finished", {
        action: "sarvam_lifecycle.campaign_finished",
        campaignId,
        finalCampaignStatus,
      });

      try {
        await this.repo.recalculateCampaignStats(campaignId);
      } catch (statsErr) {
        this.logger?.warn("Failed to recalculate campaign stats", {
          action: "sarvam_lifecycle.stats_recalc_error",
          campaignId,
          error:
            statsErr instanceof Error ? statsErr.message : String(statsErr),
        });
      }
    }
  }

  public hasPendingRetries(
    calls: Array<{ id: string; status: CallStatus; callHistory: unknown }>,
  ): boolean {
    for (const call of calls) {
      if (call.status === "COMPLETED") {
        continue;
      }

      const history = Array.isArray(call.callHistory)
        ? (call.callHistory as SarvamAttemptHistoryEntry[])
        : [];

      if (history.length === 0) {
        continue;
      }

      // Check strictly the latest attempt for this call/lead
      const latestAttempt = history[history.length - 1];
      const nextActionRaw = latestAttempt.next_action_status;

      // Terminal: if next_action_status is null or undefined, no further retry is scheduled
      if (nextActionRaw === null || nextActionRaw === undefined) {
        continue;
      }

      if (typeof nextActionRaw === "string") {
        const nextAction = nextActionRaw.toLowerCase().trim();
        if (!nextAction || nextAction === "null" || nextAction === "none") {
          continue;
        }

        // Documented pending retry statuses:
        // retry, reschedule, business_retry, short_duration_retry, provider_error_retry, internal_error_retry
        // Unknown non-empty values are also safely treated as pending so work is never prematurely completed
        return true;
      }

      // Any other non-null value (e.g. object/number) is safely treated as pending
      return true;
    }

    return false;
  }
}
