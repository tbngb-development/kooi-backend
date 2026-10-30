import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../dto/webhook.dto";
import type { CallLifecycleService } from "./call-lifecycle.service";
import type { CallHistoryItem } from "../../../../shared/types/bolna.types";
import { evaluateCallRetry } from "../../domain/rules/call-retry.rules";
import {
  parseBolnaTimestamp,
  resolveAttemptEndTime,
} from "../../domain/rules/call-timestamp.rules";
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

    let attemptNumber: number;
    if (
      payload?.batch_run_details?.retried !== undefined &&
      payload.batch_run_details.retried !== null
    ) {
      attemptNumber = payload.batch_run_details.retried + 1;
    } else if (
      payload?.retry_count !== undefined &&
      payload.retry_count !== null
    ) {
      attemptNumber = payload.retry_count + 1;
    } else if (
      historyList.length > 0 &&
      (historyList[historyList.length - 1].status === "CALLING" ||
        historyList[historyList.length - 1].status === status ||
        call.status === status)
    ) {
      attemptNumber = historyList[historyList.length - 1].attempt;
    } else {
      attemptNumber = historyList.length + 1;
    }

    const latestHistoryAttempt =
      historyList.length > 0
        ? Math.max(...historyList.map((h) => h.attempt ?? 0))
        : 0;

    // Guard against out-of-order terminal event from an earlier attempt
    if (attemptNumber < latestHistoryAttempt) {
      this.logger?.warn("Ignored out-of-order terminal event from earlier attempt", {
        callId: call.id,
        attemptNumber,
        latestHistoryAttempt,
      });
      return;
    }

    const existingIdx = historyList.findIndex(
      (h) =>
        h.attempt === attemptNumber ||
        (historyList.length === 1 &&
          !h.attempt &&
          executionId !== "unknown" &&
          h.bolnaCallId === executionId),
    );

    const existingStartedAt =
      (existingIdx >= 0 ? historyList[existingIdx].startedAt : null) ??
      (call.startedAt ? call.startedAt.toISOString() : null);

    const existingEndedAt =
      (existingIdx >= 0 ? historyList[existingIdx].endedAt : null) ??
      (call.endedAt ? call.endedAt.toISOString() : null);

    const attemptEndTime =
      existingIdx >= 0 &&
      historyList[existingIdx].status !== "CALLING" &&
      existingEndedAt
        ? parseBolnaTimestamp(existingEndedAt) ?? resolveAttemptEndTime(payload)
        : resolveAttemptEndTime(payload);

    const attemptStartTime = existingStartedAt
      ? parseBolnaTimestamp(existingStartedAt) ?? call.startedAt ?? attemptEndTime
      : parseBolnaTimestamp(
          payload?.initiated_at ??
            payload?.telephony_data?.start_time ??
            payload?.created_at ??
            payload?.at,
        ) ??
        call.startedAt ??
        attemptEndTime;

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
      timestamp: attemptEndTime.toISOString(),
      startedAt: attemptStartTime.toISOString(),
      endedAt: attemptEndTime.toISOString(),
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
      startedAt: attemptStartTime,
      endedAt: attemptEndTime,
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
      startedAt: attemptStartTime.toISOString(),
      endedAt: attemptEndTime.toISOString(),
    });

    if (call.campaignId && !willRetry) {
      await this.callLifecycle.checkBatchAndCampaignCompletion(call);
    }
  }

  /**
   * Handles canceled or stopped calls, gracefully updating states.
   */
  async handleCallCanceled(call: ResolvedCallContext): Promise<void> {
    if (call.status === "STOPPED") return;

    const historyList: CallHistoryItem[] = Array.isArray(call.callHistory)
      ? [...(call.callHistory as CallHistoryItem[])]
      : [];

    const cancelTime = new Date();
    const existingIdx =
      historyList.length > 0 &&
      historyList[historyList.length - 1].status === "CALLING"
        ? historyList.length - 1
        : -1;

    const attemptStartTime =
      existingIdx >= 0 && historyList[existingIdx].startedAt
        ? parseBolnaTimestamp(historyList[existingIdx].startedAt) ??
          call.startedAt ??
          cancelTime
        : call.startedAt ?? cancelTime;

    const historyEntry: CallHistoryItem = {
      attempt:
        existingIdx >= 0
          ? historyList[existingIdx].attempt
          : historyList.length + 1,
      bolnaCallId: call.bolnaCallId ?? "unknown",
      status: "STOPPED",
      duration: call.duration ?? 0,
      cost: call.cost ?? 0,
      timestamp: cancelTime.toISOString(),
      startedAt: attemptStartTime.toISOString(),
      endedAt: cancelTime.toISOString(),
      errorMessage: "Call stopped / canceled",
      hangupReason: "stopped",
    };

    if (existingIdx >= 0) {
      historyList[existingIdx] = historyEntry;
    } else {
      historyList.push(historyEntry);
    }

    await this.webhookRepo.updateCallTerminalState(call.id, {
      status: "STOPPED",
      callHistory: historyList,
      startedAt: attemptStartTime,
      endedAt: cancelTime,
    });

    await this.webhookRepo.updateLeadStatus(call.leadId, "STOPPED");

    this.logger?.debug("Call canceled handled", {
      action: "webhook.call.canceled",
      callId: call.id,
      tenantId: call.tenantId,
      startedAt: attemptStartTime.toISOString(),
      endedAt: cancelTime.toISOString(),
    });

    if (call.campaignId) {
      await this.callLifecycle.checkBatchAndCampaignCompletion(call);
    }
  }
}
