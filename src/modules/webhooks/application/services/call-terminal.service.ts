import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../dto/webhook.dto";
import type { CallLifecycleService } from "./call-lifecycle.service";
import type { CallHistoryItem } from "../../../../shared/types/bolna.types";
import { evaluateCallRetry } from "../../domain/rules/call-retry.rules";
import { isTerminalCallStatus } from "../../domain/rules/call-state-machine.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class CallTerminalService {
  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly callLifecycle: CallLifecycleService,
    private readonly logger?: Logger,
  ) {}

  /**
   * Handles non-answered, busy, or failed call events, evaluating retry
   * configurations and transitioning call and lead states accordingly.
   */
  async handleCallTerminal(
    call: ResolvedCallContext,
    status: "NO_ANSWER" | "BUSY" | "FAILED",
    payload?: WebhookCallPayload,
  ): Promise<void> {
    const retryConfig = call.retryConfig ?? call.campaignDefaultRetryConfig;

    const historyList: CallHistoryItem[] = Array.isArray(call.callHistory)
      ? [...(call.callHistory as CallHistoryItem[])]
      : [];

    const executionId =
      payload?.id ??
      payload?.execution_id ??
      payload?.run_id ??
      call.bolnaCallId ??
      "unknown";

    let attemptNumber = historyList.length + 1;
    if (
      payload?.batch_run_details?.retried !== undefined &&
      payload.batch_run_details.retried !== null
    ) {
      attemptNumber = Math.max(attemptNumber, payload.batch_run_details.retried + 1);
    } else if (
      payload?.retry_count !== undefined &&
      payload.retry_count !== null
    ) {
      attemptNumber = Math.max(attemptNumber, payload.retry_count + 1);
    }

    const existingIdx = historyList.findIndex(
      (h) =>
        h.attempt === attemptNumber ||
        (executionId !== "unknown" && h.bolnaCallId === executionId),
    );

    const duration =
      typeof payload?.telephony_data?.duration === "string"
        ? parseInt(payload.telephony_data.duration, 10)
        : (payload?.telephony_data?.duration ??
          payload?.conversation_duration ??
          payload?.duration ??
          0);

    const historyEntry: CallHistoryItem = {
      attempt:
        existingIdx >= 0
          ? historyList[existingIdx].attempt
          : attemptNumber,
      bolnaCallId: executionId,
      status,
      duration: duration ?? 0,
      cost: payload?.total_cost ?? 0,
      timestamp:
        payload?.created_at ??
        (payload as any)?.at ??
        new Date().toISOString(),
      errorMessage: payload?.error_message ?? null,
      hangupReason: payload?.telephony_data?.hangup_reason ?? null,
    };

    if (existingIdx >= 0) {
      historyList[existingIdx] = historyEntry;
    } else {
      historyList.push(historyEntry);
    }

    let isBatchStopped = false;
    if (call.batchId) {
      const batchStatus = await this.webhookRepo.findBatchStatusById(
        call.batchId,
      );
      if (batchStatus === "STOPPED") {
        isBatchStopped = true;
      }
    }

    // Retries already executed before this attempt:
    const retriesCompleted = Math.max(0, historyEntry.attempt - 1);

    const { willRetry, finalCallStatus, leadStatus } = evaluateCallRetry({
      isBatchStopped,
      retryConfig,
      currentAttempts: retriesCompleted,
      status,
    });

    await this.webhookRepo.updateCallTerminalState(call.id, {
      status: finalCallStatus,
      duration: duration ?? call.duration,
      cost: payload?.total_cost ?? call.cost,
      recording:
        payload?.telephony_data?.recording_url ??
        payload?.recording_url ??
        call.recording,
      callHistory: historyList,
      endedAt: new Date(),
    });

    await this.webhookRepo.updateLeadStatus(call.leadId, leadStatus);

    this.logger?.debug("Call terminal handled", {
      action: "webhook.call.terminal",
      callId: call.id,
      tenantId: call.tenantId,
      status: finalCallStatus,
      leadStatus,
      willRetry,
      attempt: historyEntry.attempt,
      retriesCompleted,
    });

    await this.callLifecycle.checkBatchAndCampaignCompletion(call);
  }

  /**
   * Handles canceled or stopped calls, gracefully updating states.
   */
  async handleCallCanceled(call: ResolvedCallContext): Promise<void> {
    if (call.status === "STOPPED") return;

    const historyList: CallHistoryItem[] = Array.isArray(call.callHistory)
      ? [...(call.callHistory as CallHistoryItem[])]
      : [];

    const historyEntry: CallHistoryItem = {
      attempt: historyList.length + 1,
      bolnaCallId: call.bolnaCallId ?? "unknown",
      status: "STOPPED",
      duration: call.duration ?? 0,
      cost: call.cost ?? 0,
      timestamp: new Date().toISOString(),
      errorMessage: "Call stopped / canceled",
      hangupReason: "stopped",
    };
    historyList.push(historyEntry);

    await this.webhookRepo.updateCallTerminalState(call.id, {
      status: "STOPPED",
      callHistory: historyList,
      endedAt: new Date(),
    });

    await this.webhookRepo.updateLeadStatus(call.leadId, "STOPPED");

    this.logger?.debug("Call canceled handled", {
      action: "webhook.call.canceled",
      callId: call.id,
      tenantId: call.tenantId,
    });

    await this.callLifecycle.checkBatchAndCampaignCompletion(call);
  }
}
