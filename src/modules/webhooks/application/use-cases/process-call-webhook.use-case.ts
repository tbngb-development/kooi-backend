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
  mapLastRetryToLeadStatus,
  mapRetryStatusToCallStatus,
} from "../../domain/rules/call-retry.rules";
import {
  canApplyCallCompletion,
  canTransitionCallStatus,
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
   * A terminal/stop webhook may still advance a call through the retry
   * dispositions (NO_ANSWER/BUSY/FAILED) but must never overwrite a completed
   * call or a tenant-wide credit-enforcement stop.
   */
  private canApplyTerminalEvent(
    resolved: ResolvedCallContext,
    target: CallStatus,
    incomingState: string,
  ): boolean {
    if (canTransitionCallStatus(resolved.status, target)) return true;
    this.logger?.warn("Ignored out-of-order terminal event", {
      action: "webhook.call.terminal_ignored",
      callId: resolved.id,
      currentStatus: resolved.status,
      targetStatus: target,
      incomingState,
    });
    return false;
  }

  async execute(payload: WebhookCallPayload): Promise<void> {
    this.logger?.debug("webhook payload: ", { payload });
    const callId = payload.id ?? payload.execution_id ?? payload.run_id;
    if (!callId) {
      throw new WebhookResolutionError("Missing execution / call ID.");
    }

    const state = payload.status.toLowerCase().replace("_", "-");
    this.logger?.warn("call status: ", { state });

    switch (state) {
      case "queued":
        break;

      case "scheduled":
      case "rescheduled": {
        this.logger?.warn("call scheduled: ", { payload });
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (resolved) {
          const lastRetry =
            payload.retry_history?.[payload.retry_history.length - 1];

          // Determine the actual call disposition of the executed attempt
          const targetCallStatus = lastRetry?.status
            ? mapRetryStatusToCallStatus(lastRetry.status)
            : resolved.status === "PENDING"
              ? "SCHEDULED"
              : "NO_ANSWER";

          if (!canTransitionCallStatus(resolved.status, targetCallStatus)) {
            this.logger?.warn("Ignored out-of-order scheduled event on terminal call", {
              callId: resolved.id,
              currentStatus: resolved.status,
              targetCallStatus,
            });
            break;
          }

          const updatedHistory: CallHistoryItem[] = [
            ...((resolved.callHistory as CallHistoryItem[]) ?? []),
          ];
          if (payload.retry_history && Array.isArray(payload.retry_history)) {
            const mappedBolnaHistory: CallHistoryItem[] = payload.retry_history.map(
              (rh, idx) => ({
                attempt: rh.attempt ?? idx + 1,
                bolnaCallId: callId,
                status: (rh.status?.toUpperCase() ?? "SCHEDULED") as string,
                duration: rh.duration ?? null,
                cost: null,
                timestamp:
                  rh.created_at ??
                  rh.at ??
                  new Date().toISOString(),
                errorMessage: rh.error_message ?? null,
                hangupReason: rh.hangup_reason ?? null,
              }),
            );
            for (const item of mappedBolnaHistory) {
              const existingIdx = updatedHistory.findIndex(
                (h) => h.attempt === item.attempt,
              );
              if (existingIdx >= 0) {
                updatedHistory[existingIdx] = {
                  ...updatedHistory[existingIdx],
                  ...item,
                };
              } else {
                updatedHistory.push(item);
              }
            }
          }

          await this.webhookRepo.updateCallTerminalState(resolved.id, {
            status: targetCallStatus,
            duration: lastRetry?.duration ?? resolved.duration,
            callHistory: updatedHistory,
            endedAt: new Date(),
          });

          if (lastRetry?.status) {
            const leadStatus = mapLastRetryToLeadStatus(lastRetry.status);
            await this.webhookRepo.updateLeadStatus(resolved.leadId, leadStatus);
          }

          // Maintain Batch and Campaign in RUNNING state while retries are scheduled
          if (resolved.batchId) {
            const batchStatus = await this.webhookRepo.findBatchStatusById(
              resolved.batchId,
            );
            if (
              batchStatus &&
              batchStatus !== "STOPPED" &&
              batchStatus !== "FAILED"
            ) {
              await this.webhookRepo.updateBatchStatus(
                resolved.batchId,
                "RUNNING",
              );
            }
          }

          if (resolved.campaignId) {
            const updated = await this.webhookRepo.markCampaignRunningIfActive(
              resolved.campaignId,
            );
            if (!updated) {
              this.logger?.warn("Ignored campaign RUNNING update on finalized campaign", {
                action: "webhook.campaign.running_ignored",
                campaignId: resolved.campaignId,
                incomingState: state,
              });
            }
          }
        }
        break;
      }

      case "initiated":
      case "ringing":
      case "in-progress":
      case "answered": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;

        // Guard against out-of-order webhooks regressing a completed/terminal call
        if (!canTransitionCallStatus(resolved.status, "CALLING")) {
          this.logger?.warn("Ignored out-of-order in-flight event on terminal call", {
            callId: resolved.id,
            currentStatus: resolved.status,
            incomingState: state,
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

        if (resolved.batchId) {
          const batchStatus = await this.webhookRepo.findBatchStatusById(
            resolved.batchId,
          );
          if (
            batchStatus &&
            batchStatus !== "STOPPED" &&
            batchStatus !== "COMPLETED" &&
            batchStatus !== "FAILED"
          ) {
            await this.webhookRepo.updateBatchStatus(
              resolved.batchId,
              "RUNNING",
              new Date(),
            );
          }
        }

        if (resolved.campaignId) {
          const updated = await this.webhookRepo.markCampaignRunningIfActive(
            resolved.campaignId,
            new Date(),
          );
          if (!updated) {
            this.logger?.warn("Ignored campaign RUNNING update on finalized campaign", {
              action: "webhook.campaign.running_ignored",
              campaignId: resolved.campaignId,
              incomingState: state,
            });
          }
        }

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
        if (!resolved || !this.canApplyTerminalEvent(resolved, "NO_ANSWER", state)) {
          break;
        }
        await this.callTerminal.handleCallTerminal(resolved, "NO_ANSWER", payload);
        break;
      }

      case "busy": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved || !this.canApplyTerminalEvent(resolved, "BUSY", state)) break;
        await this.callTerminal.handleCallTerminal(resolved, "BUSY", payload);
        break;
      }

      case "failed":
      case "error":
      case "balance-low": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved || !this.canApplyTerminalEvent(resolved, "FAILED", state)) {
          break;
        }
        await this.callTerminal.handleCallTerminal(resolved, "FAILED", payload);
        break;
      }

      case "stopped":
      case "canceled": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved || !this.canApplyTerminalEvent(resolved, "STOPPED", state)) {
          break;
        }
        await this.callTerminal.handleCallCanceled(resolved);
        break;
      }
    }
  }
}
