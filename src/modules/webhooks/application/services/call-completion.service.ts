import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../dto/webhook.dto";
import type { CallHistoryItem } from "../../../../shared/types/bolna.types";
import {
  parseBolnaTimestamp,
  resolveAttemptEndTime,
} from "../../domain/rules/call-timestamp.rules";
import type { MaterializeCallExtractionsUseCase } from "../../../extractions/application/use-cases/materialize-call-extractions.use-case";
import type { DebitWalletForCallUseCase } from "../../../wallet/application/use-cases/debit-wallet.use-case";
import type { StopBatchesOnInsufficientBalanceUseCase } from "../../../wallet/application/use-cases/stop-batches-on-insufficient-balance.use-case";
import type { CallLifecycleService } from "./call-lifecycle.service";
import type { Queue } from "bull";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class CallCompletionService {
  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly materializeCallExtractions?: MaterializeCallExtractionsUseCase,
    private readonly debitWalletForCall?: DebitWalletForCallUseCase,
    private readonly stopBatchesOnInsufficientBalance?: StopBatchesOnInsufficientBalanceUseCase,
    private readonly classifierQueue?: Queue,
    private readonly callLifecycle?: CallLifecycleService,
    private readonly logger?: Logger,
  ) {}

  /**
   * Handles call completion: stores transcripts and recordings, runs extractions,
   * settles billing, triggers downstream queues, and reconciles lifecycle state.
   */
  async handleCallCompleted(
    call: ResolvedCallContext,
    payload: WebhookCallPayload,
    bolnaCallId: string,
  ): Promise<void> {
    const messages = (payload.messages ?? []).map((m) => ({
      role: m.role === "agent" ? "assistant" : "user",
      message: m.content,
      time: m.created_at ?? null,
    }));

    const transcript =
      payload.transcript ||
      messages.map((m) => `${m.role}: ${m.message}`).join("\n") ||
      null;

    const duration =
      typeof payload.telephony_data?.duration === "string"
        ? parseInt(payload.telephony_data.duration, 10)
        : (payload.telephony_data?.duration ??
          payload.conversation_duration ??
          payload.duration ??
          null);

    // 1. Delegate dynamic extraction materialization to specialized use case
    if (this.materializeCallExtractions && payload.extracted_data) {
      try {
        await this.materializeCallExtractions.execute({
          callId: call.id,
          tenantId: call.tenantId,
          extractedData: payload.extracted_data as Record<string, unknown>,
        });
      } catch (err) {
        this.logger?.error("Dynamic extraction materialization failed", err, {
          action: "webhook.call.extraction_failed",
          callId: call.id,
          tenantId: call.tenantId,
        });
      }
    }

    // 2. Build and record completed attempt in call history
    const historyList: CallHistoryItem[] = Array.isArray(call.callHistory)
      ? [...(call.callHistory as CallHistoryItem[])]
      : [];

    const isDuplicate = call.status === "COMPLETED";

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
        historyList[historyList.length - 1].status === "COMPLETED" ||
        isDuplicate)
    ) {
      attemptNumber = historyList[historyList.length - 1].attempt;
    } else {
      attemptNumber = historyList.length + 1;
    }

    const latestHistoryAttempt =
      historyList.length > 0
        ? Math.max(...historyList.map((h) => h.attempt ?? 0))
        : 0;

    // Guard against out-of-order completion event from an earlier attempt
    if (attemptNumber < latestHistoryAttempt) {
      this.logger?.warn("Ignored out-of-order completion event from earlier attempt", {
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
          bolnaCallId &&
          h.bolnaCallId === String(bolnaCallId)),
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

    const historyEntry: CallHistoryItem = {
      attempt:
        existingIdx >= 0
          ? historyList[existingIdx].attempt
          : attemptNumber,
      bolnaCallId: String(bolnaCallId),
      status: "COMPLETED",
      duration: duration ?? 0,
      cost: payload?.total_cost ?? null,
      timestamp: attemptEndTime.toISOString(),
      startedAt: attemptStartTime.toISOString(),
      endedAt: attemptEndTime.toISOString(),
      errorMessage: null,
      hangupReason: payload?.telephony_data?.hangup_reason ?? null,
    };

    if (existingIdx >= 0) {
      historyList[existingIdx] = historyEntry;
    } else {
      historyList.push(historyEntry);
    }

    // 3. Persist call terminal state
    await this.webhookRepo.updateCallTerminalState(call.id, {
      status: "COMPLETED",
      transcript,
      transcriptMessages: messages.length > 0 ? messages : null,
      duration,
      recording:
        payload.telephony_data?.recording_url ?? payload.recording_url ?? null,
      cost: payload.total_cost ?? null,
      extracted_data: payload.extracted_data,
      callHistory: historyList,
      startedAt: attemptStartTime,
      endedAt: attemptEndTime,
    });

    // 3. Mark lead as CALLED
    await this.webhookRepo.updateLeadStatus(call.leadId, "CALLED");

    // 4. Debit wallet for call usage (deterministic billing)
    if (!isDuplicate && this.debitWalletForCall && duration && duration > 0) {
      try {
        const debitResult = await this.debitWalletForCall.execute({
          tenantId: call.tenantId,
          callId: call.id,
          bolnaCallId: String(bolnaCallId),
          durationSec: duration,
        });

        if (debitResult) {
          await this.webhookRepo.updateCallCostBreakdown(call.id, {
            platformCost: debitResult.amountPaisa,
            billableSeconds: debitResult.billableSeconds,
            planVersionId: debitResult.planVersionId,
            appliedRate: debitResult.appliedRate,
            appliedMinSec: debitResult.appliedMinSec,
            appliedIncrementSec: debitResult.appliedIncrementSec,
            chargedAmount: debitResult.amountPaisa,
          });
        }
      } catch (err) {
        this.logger?.error("Wallet debit failed during call webhook", err, {
          action: "webhook.call.debit_failed",
          callId: call.id,
          tenantId: call.tenantId,
          bolnaCallId: String(bolnaCallId),
          durationSec: duration,
        });
      }
    }

    // 6. Check tenant credit limits and trigger circuit breaker if depleted
    if (this.stopBatchesOnInsufficientBalance) {
      this.stopBatchesOnInsufficientBalance
        .execute({ tenantId: call.tenantId })
        .catch((err) =>
          this.logger?.error(
            "Credit limit check failed during call completed webhook",
            err,
            {
              action: "webhook.call.credit_check_completed",
              tenantId: call.tenantId,
              callId: call.id,
            },
          ),
        );
    }

    // 7. Enqueue classifier extraction (async, non-blocking)
    if (this.classifierQueue && transcript) {
      this.classifierQueue
        .add(
          { callId: call.id, tenantId: call.tenantId },
          { jobId: `classifier-${call.id}` },
        )
        .catch((err) =>
          this.logger?.warn("Classifier enqueue failed", {
            action: "webhook.call.classifier_enqueue_failed",
            callId: call.id,
            error: err?.message,
          }),
        );
    }

    this.logger?.info("Call completed", {
      action: "webhook.call.completed",
      callId: call.id,
      tenantId: call.tenantId,
      campaignId: call.campaignId ?? undefined,
      batchId: call.batchId ? call.batchId : undefined,
      bolnaCallId: String(bolnaCallId),
      durationSec: duration,
    });

    // 8. Reconcile batch and campaign completion
    if (this.callLifecycle && call.campaignId) {
      await this.callLifecycle.checkBatchAndCampaignCompletion(call);
    }
  }
}
