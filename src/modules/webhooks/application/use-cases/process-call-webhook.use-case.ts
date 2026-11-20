import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import type { CallStatus } from "@prisma/client";
import type { WebhookCallPayload } from "../dto/webhook.dto";
import type { CallHistoryItem } from "../../../../shared/types/bolna.types";
import { WebhookResolutionError } from "../../domain/errors/webhook.errors";
import type { CreditEnforcementOrchestrator } from "../../../wallet/application/use-cases/credit-enforcement-orchestrator";
import type { CallResolverService } from "../services/call-resolver.service";
import type { CallCompletionService } from "../services/call-completion.service";
import type { CallTerminalService } from "../services/call-terminal.service";
import {
  getBolnaEventAttempt,
  getCallRecordAttempt,
  mapRetryStatusToCallStatus,
} from "../../domain/rules/call-retry.rules";
import {
  canApplyCallCompletion,
  canTransitionCallStatus,
  isRetryableTerminalCallStatus,
} from "../../domain/rules/call-state-machine.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class ProcessCallWebhookUseCase {
  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly callResolver: CallResolverService,
    private readonly callCompletion: CallCompletionService,
    private readonly callTerminal: CallTerminalService,
    private readonly enforcement?: CreditEnforcementOrchestrator,
    private readonly logger?: Logger,
  ) {}

  /**
   * A terminal/stop webhook may only advance a retryable terminal outcome when
   * it carries a strictly higher attempt. It must never overwrite a completed
   * call or a tenant-wide credit-enforcement stop.
   */
  private canApplyTerminalEvent(
    resolved: ResolvedCallContext,
    target: CallStatus,
    incomingState: string,
    currentAttempt: number,
    incomingAttempt: number,
  ): boolean {
    if (incomingAttempt < currentAttempt) {
      this.logger?.warn("Ignored out-of-order terminal event", {
        action: "webhook.call.terminal_ignored",
        callId: resolved.id,
        currentStatus: resolved.status,
        targetStatus: target,
        incomingState,
        currentAttempt,
        incomingAttempt,
      });
      return false;
    }

    if (
      canTransitionCallStatus(resolved.status, target, {
        currentAttempt,
        incomingAttempt,
      })
    ) {
      return true;
    }

    this.logger?.warn("Ignored out-of-order terminal event", {
      action: "webhook.call.terminal_ignored",
      callId: resolved.id,
      currentStatus: resolved.status,
      targetStatus: target,
      incomingState,
      currentAttempt,
      incomingAttempt,
    });
    return false;
  }

  /**
   * Webhook status is authoritative. termination_reason is only used to
   * refine an ambiguous failed outcome into BUSY/NO_ANSWER; unrelated values
   * are ignored.
   */
  private resolveTerminalStatus(
    payload: WebhookCallPayload,
    fallback: "NO_ANSWER" | "BUSY" | "FAILED",
  ): CallStatus {
    if (fallback !== "FAILED") return fallback;

    const reason = (payload.termination_reason ?? "")
      .toLowerCase()
      .trim()
      .replace(/_/g, "-");
    if (reason === "busy") return "BUSY";
    if (reason === "no-answer" || reason === "no_answer") return "NO_ANSWER";
    return "FAILED";
  }

  /**
   * When a terminal disposition predates our first persisted history entry,
   * infer it as the attempt immediately before the incoming event. A payload
   * without a higher retry_count therefore cannot silently overwrite it.
   */
  private resolveCurrentAttempt(
    resolved: ResolvedCallContext,
    incomingAttempt: number,
  ): number {
    const persistedAttempt = getCallRecordAttempt(resolved);
    if (persistedAttempt > 0) return persistedAttempt;

    return isRetryableTerminalCallStatus(resolved.status)
      ? Math.max(1, incomingAttempt - 1)
      : 0;
  }

  private buildScheduledHistory(
    resolved: ResolvedCallContext,
    payload: WebhookCallPayload,
    callId: string,
    incomingAttempt: number,
  ): CallHistoryItem[] {
    const history: CallHistoryItem[] = [
      ...((resolved.callHistory as CallHistoryItem[]) ?? []),
    ];

    const upsert = (item: CallHistoryItem): void => {
      const existingIdx = history.findIndex((h) => h.attempt === item.attempt);
      if (existingIdx >= 0) {
        history[existingIdx] = { ...history[existingIdx], ...item };
      } else {
        history.push(item);
      }
    };

    const retries = Array.isArray(payload.retry_history)
      ? payload.retry_history
      : [];
    retries.forEach((retry, index) => {
      upsert({
        attempt:
          typeof retry.attempt === "number" && Number.isFinite(retry.attempt)
            ? retry.attempt
            : index + 1,
        bolnaCallId: callId,
        status: mapRetryStatusToCallStatus(retry.status),
        duration: retry.duration ?? null,
        cost: null,
        timestamp: retry.created_at ?? retry.at ?? new Date().toISOString(),
        errorMessage: retry.error_message ?? null,
        hangupReason: retry.hangup_reason ?? null,
      });
    });

    upsert({
      attempt: incomingAttempt,
      bolnaCallId: callId,
      status: "SCHEDULED",
      duration: null,
      cost: null,
      timestamp: payload.created_at ?? payload.at ?? new Date().toISOString(),
      errorMessage: payload.error_message ?? null,
      hangupReason: payload.telephony_data?.hangup_reason ?? null,
    });

    return history;
  }

  private async keepBatchAndCampaignRunning(
    resolved: ResolvedCallContext,
    incomingState: string,
    allowCompletedBatch: boolean,
    startedAt?: Date,
  ): Promise<void> {
    if (resolved.batchId) {
      const batchStatus = await this.webhookRepo.findBatchStatusById(
        resolved.batchId,
      );
      const blockedStatuses: string[] = ["STOPPED", "FAILED"];
      if (!allowCompletedBatch) blockedStatuses.push("COMPLETED");

      if (batchStatus && !blockedStatuses.includes(batchStatus)) {
        await this.webhookRepo.updateBatchStatus(
          resolved.batchId,
          "RUNNING",
          startedAt,
        );
      }
    }

    if (resolved.campaignId) {
      const updated = startedAt
        ? await this.webhookRepo.markCampaignRunningIfActive(
            resolved.campaignId,
            startedAt,
          )
        : await this.webhookRepo.markCampaignRunningIfActive(
            resolved.campaignId,
          );
      if (!updated) {
        this.logger?.warn("Ignored campaign RUNNING update on finalized campaign", {
          action: "webhook.campaign.running_ignored",
          campaignId: resolved.campaignId,
          incomingState,
        });
      }
    }
  }

  async execute(payload: WebhookCallPayload): Promise<void> {
    this.logger?.debug("webhook payload: ", { payload });
    const callId = payload.id ?? payload.execution_id;
    if (!callId) {
      throw new WebhookResolutionError("Missing execution / call ID.");
    }

    const state = payload.status.toLowerCase().replace(/_/g, "-");
    this.logger?.warn("call status: ", { state });

    switch (state) {
      case "queued": {
        const resolved = await this.callResolver.resolveCallRecord(
          callId,
          payload,
          "PENDING",
        );
        if (!resolved || resolved.status !== "PENDING") break;

        // queued means accepted but not dialed. Never downgrade an existing
        // SCHEDULED/CALLING/terminal row back to PENDING.
        await this.webhookRepo.updateLeadStatus(resolved.leadId, "PENDING");
        break;
      }

      case "scheduled":
      case "rescheduled":
      case "re-scheduled": {
        this.logger?.warn("call scheduled: ", { payload });
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;

        const incomingAttempt = getBolnaEventAttempt(payload);
        const currentAttempt = this.resolveCurrentAttempt(
          resolved,
          incomingAttempt,
        );

        if (resolved.status === "SCHEDULED" && incomingAttempt <= currentAttempt) {
          this.logger?.debug("Ignored duplicate scheduled event", {
            action: "webhook.call.scheduled_duplicate_ignored",
            callId: resolved.id,
            currentAttempt,
            incomingAttempt,
          });
          break;
        }

        if (incomingAttempt < currentAttempt) {
          this.logger?.warn("Ignored stale scheduled event", {
            action: "webhook.call.scheduled_stale_ignored",
            callId: resolved.id,
            currentStatus: resolved.status,
            currentAttempt,
            incomingAttempt,
          });
          break;
        }

        if (
          !canTransitionCallStatus(resolved.status, "SCHEDULED", {
            currentAttempt,
            incomingAttempt,
          })
        ) {
          this.logger?.warn("Ignored out-of-order scheduled event", {
            action: "webhook.call.scheduled_ignored",
            callId: resolved.id,
            currentStatus: resolved.status,
            currentAttempt,
            incomingAttempt,
          });
          break;
        }

        await this.webhookRepo.updateCallStatusAndHistory(
          resolved.id,
          callId,
          "SCHEDULED",
          this.buildScheduledHistory(resolved, payload, callId, incomingAttempt),
        );
        await this.webhookRepo.updateLeadStatus(resolved.leadId, "PENDING");

        // Retries keep the campaign/batch active while Bolna waits to redial.
        await this.keepBatchAndCampaignRunning(resolved, state, true);
        break;
      }

      case "initiated":
      case "ringing":
      case "in-progress":
      case "answered":
      case "call-disconnected": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;

        const incomingAttempt = getBolnaEventAttempt(payload);
        const currentAttempt = this.resolveCurrentAttempt(
          resolved,
          incomingAttempt,
        );
        if (incomingAttempt < currentAttempt) {
          this.logger?.warn("Ignored out-of-order in-flight event on terminal call", {
            callId: resolved.id,
            currentStatus: resolved.status,
            incomingState: state,
            currentAttempt,
            incomingAttempt,
          });
          break;
        }

        if (
          !canTransitionCallStatus(resolved.status, "CALLING", {
            currentAttempt,
            incomingAttempt,
          })
        ) {
          this.logger?.warn("Ignored out-of-order in-flight event on terminal call", {
            callId: resolved.id,
            currentStatus: resolved.status,
            incomingState: state,
            currentAttempt,
            incomingAttempt,
          });
          break;
        }

        const currentHistory =
          (resolved.callHistory as CallHistoryItem[]) ?? [];
        await this.webhookRepo.updateCallStatusAndHistory(
          resolved.id,
          callId,
          "CALLING",
          currentHistory,
        );

        await this.webhookRepo.updateLeadStatus(resolved.leadId, "CALLING");

        await this.keepBatchAndCampaignRunning(resolved, state, false, new Date());

        // U-04: enforcement runs on the single awaited path before ACK.
        if (this.enforcement) {
          try {
            await this.enforcement.enforce({ tenantId: resolved.tenantId });
          } catch (err) {
            this.logger?.error(
              "Credit enforcement failed during call webhook",
              err,
              {
                action: "webhook.call.credit_enforcement",
                tenantId: resolved.tenantId,
                callId: resolved.id,
              },
            );
          }
        }
        break;
      }

      case "completed":
      case "ended":
      case "call-completed": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;

        // A late completion after a stop/no-answer/busy/failure would resurrect
        // a terminal call and re-run billing and lifecycle side effects. A
        // duplicate completion of an already COMPLETED call is still replayed
        // so provider retries after a downstream failure can finish the work.
        if (!canApplyCallCompletion(resolved.status)) {
          this.logger?.warn("Ignored late completion event on terminal call", {
            action: "webhook.call.completed_ignored",
            callId: resolved.id,
            currentStatus: resolved.status,
            incomingState: state,
          });
          break;
        }

        await this.callCompletion.handleCallCompleted(resolved, payload, callId);
        break;
      }

      case "no-answer": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;

        const target = this.resolveTerminalStatus(payload, "NO_ANSWER");
        const incomingAttempt = getBolnaEventAttempt(payload);
        const currentAttempt = this.resolveCurrentAttempt(
          resolved,
          incomingAttempt,
        );
        if (
          this.canApplyTerminalEvent(
            resolved,
            target,
            state,
            currentAttempt,
            incomingAttempt,
          )
        ) {
          await this.callTerminal.handleCallTerminal(resolved, target as "NO_ANSWER", payload);
        }
        break;
      }

      case "busy": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;

        const target = this.resolveTerminalStatus(payload, "BUSY");
        const incomingAttempt = getBolnaEventAttempt(payload);
        const currentAttempt = this.resolveCurrentAttempt(
          resolved,
          incomingAttempt,
        );
        if (
          this.canApplyTerminalEvent(
            resolved,
            target,
            state,
            currentAttempt,
            incomingAttempt,
          )
        ) {
          await this.callTerminal.handleCallTerminal(resolved, target as "BUSY", payload);
        }
        break;
      }

      case "failed":
      case "error":
      case "balance-low": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;

        const target = this.resolveTerminalStatus(payload, "FAILED");
        const incomingAttempt = getBolnaEventAttempt(payload);
        const currentAttempt = this.resolveCurrentAttempt(
          resolved,
          incomingAttempt,
        );
        if (
          this.canApplyTerminalEvent(
            resolved,
            target,
            state,
            currentAttempt,
            incomingAttempt,
          )
        ) {
          await this.callTerminal.handleCallTerminal(
            resolved,
            target as "FAILED",
            payload,
          );
        }
        break;
      }

      case "stopped":
      case "canceled": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;

        const incomingAttempt = getBolnaEventAttempt(payload);
        const currentAttempt = this.resolveCurrentAttempt(
          resolved,
          incomingAttempt,
        );
        if (
          this.canApplyTerminalEvent(
            resolved,
            "STOPPED",
            state,
            currentAttempt,
            incomingAttempt,
          )
        ) {
          await this.callTerminal.handleCallCanceled(resolved);
        }
        break;
      }
    }
  }
}
