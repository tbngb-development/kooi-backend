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

    // 2. Ensure in-progress state if batch is CREATED, SCHEDULED, or PROCESSING
    if (
      batch.status === "CREATED" ||
      batch.status === "SCHEDULED" ||
      batch.status === "PROCESSING"
    ) {
      await this.repo.updateBatchStatus(batchId, "RUNNING");
      await this.repo.updateCampaignStatus(campaignId, "RUNNING");
    }

    // 3. Inspect active work in the batch
    const [activeLeads, activeCalls, callsInBatch] = await Promise.all([
      this.repo.countActiveLeadsInBatch(batchId),
      this.repo.countActiveCallsInBatch(batchId),
      this.repo.getCallsInBatch(batchId),
    ]);

    // Check if any call has pending retries remaining
    const pendingRetries = this.hasPendingRetries(
      batch.retryConfig,
      callsInBatch,
    );

    // If there is still active work or pending retries, batch remains RUNNING
    if (activeLeads > 0 || activeCalls > 0 || pendingRetries) {
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
      const allBatchesFailed = executedBatches.every((s) => s === "FAILED");
      const finalCampaignStatus: CampaignStatus = allBatchesFailed
        ? "FAILED"
        : "COMPLETED";

      await this.repo.updateCampaignStatus(
        campaignId,
        finalCampaignStatus,
        new Date(),
      );

      try {
        await this.repo.recalculateCampaignStats(campaignId);
      } catch (statsErr) {
        this.logger?.warn("Failed to recalculate campaign stats", {
          action: "sarvam_lifecycle.stats_recalc_error",
          campaignId,
          error: statsErr instanceof Error ? statsErr.message : String(statsErr),
        });
      }

      this.logger?.info("Sarvam campaign marked as finished", {
        action: "sarvam_lifecycle.campaign_finished",
        campaignId,
        finalCampaignStatus,
      });
    }
  }

  private hasPendingRetries(
    retryConfigRaw: unknown,
    calls: Array<{ id: string; status: CallStatus; callHistory: unknown }>,
  ): boolean {
    if (!retryConfigRaw || typeof retryConfigRaw !== "object") {
      return false;
    }

    const config = retryConfigRaw as {
      enabled?: boolean;
      max_retries?: number;
      retry_on_statuses?: string[];
    };

    if (!config.enabled || !config.max_retries || config.max_retries <= 0) {
      return false;
    }

    const maxRetries = config.max_retries;

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

      const latestAttempt = history[history.length - 1];
      const attemptIndex =
        typeof latestAttempt.retry_attempt === "number"
          ? latestAttempt.retry_attempt
          : history.length - 1;

      if (attemptIndex >= maxRetries) {
        continue;
      }

      const nextAction = latestAttempt.next_action_status?.toLowerCase().trim();
      const isRetryAction =
        Boolean(nextAction) &&
        (nextAction === "retry" ||
          nextAction === "reschedule" ||
          nextAction!.includes("retry"));

      if (isRetryAction) {
        return true;
      }
    }

    return false;
  }
}
