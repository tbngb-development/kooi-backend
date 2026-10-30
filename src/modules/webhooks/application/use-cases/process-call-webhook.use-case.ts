import type { WebhookRepository } from "../interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../dto/webhook.dto";
import type { CallHistoryItem } from "../../../../shared/types/bolna.types";
import { WebhookResolutionError } from "../../domain/errors/webhook.errors";
import type { StopBatchesOnInsufficientBalanceUseCase } from "../../../wallet/application/use-cases/stop-batches-on-insufficient-balance.use-case";
import type { CallResolverService } from "../services/call-resolver.service";
import type { CallCompletionService } from "../services/call-completion.service";
import type { CallTerminalService } from "../services/call-terminal.service";
import {
  isRetryPermitted,
  mapLastRetryToLeadStatus,
} from "../../domain/rules/call-retry.rules";
import {
  parseBolnaTimestamp,
  resolveAttemptStartTime,
} from "../../domain/rules/call-timestamp.rules";
import { canTransitionCallStatus } from "../../domain/rules/call-state-machine.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class ProcessCallWebhookUseCase {
  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly callResolver: CallResolverService,
    private readonly callCompletion: CallCompletionService,
    private readonly callTerminal: CallTerminalService,
    private readonly stopBatchesOnInsufficientBalance?: StopBatchesOnInsufficientBalanceUseCase,
    private readonly logger?: Logger,
  ) {}

  async execute(payload: WebhookCallPayload): Promise<void> {
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

          const existingHistory: CallHistoryItem[] = Array.isArray(resolved.callHistory)
            ? [...(resolved.callHistory as CallHistoryItem[])]
            : [];
          const bolnaRetryHistory = Array.isArray(payload.retry_history)
            ? payload.retry_history
            : [];

          let isBatchStopped = false;
          if (resolved.batchId) {
            const batchStatus = await this.webhookRepo.findBatchStatusById(
              resolved.batchId,
            );
            if (batchStatus === "STOPPED") {
              isBatchStopped = true;
            }
          }

          const attemptsExecuted = Math.max(
            existingHistory.length,
            bolnaRetryHistory.length,
            payload.retry_count ?? 0,
          );

          const retryConfig =
            resolved.retryConfig ?? resolved.campaignDefaultRetryConfig;

          const isRetryScheduled = isRetryPermitted({
            isBatchStopped,
            retryConfig,
            attemptsExecuted: attemptsExecuted > 0 ? attemptsExecuted : 1,
            lastAttemptStatus: lastRetry?.status ?? resolved.status,
          });

          if (
            !canTransitionCallStatus(resolved.status, "SCHEDULED", {
              isRetryScheduled,
            })
          ) {
            this.logger?.warn("Ignored out-of-order scheduled event on call", {
              callId: resolved.id,
              currentStatus: resolved.status,
              isRetryScheduled,
            });
            break;
          }

          const updatedHistory: CallHistoryItem[] = [...existingHistory];
          if (bolnaRetryHistory.length > 0) {
            const mappedBolnaHistory: CallHistoryItem[] = bolnaRetryHistory.map(
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
                startedAt: rh.started_at ?? null,
                endedAt:
                  rh.ended_at ??
                  rh.updated_at ??
                  rh.created_at ??
                  rh.at ??
                  null,
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
                  startedAt:
                    item.startedAt ??
                    updatedHistory[existingIdx].startedAt ??
                    null,
                  endedAt:
                    item.endedAt ??
                    updatedHistory[existingIdx].endedAt ??
                    null,
                };
              } else {
                updatedHistory.push(item);
              }
            }
          }

          // Do NOT pass timestamps here: preserves previous attempt's startedAt & endedAt during SCHEDULED
          await this.webhookRepo.updateCallStatusAndHistory(
            resolved.id,
            callId,
            "SCHEDULED",
            updatedHistory,
          );

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
            await this.webhookRepo.updateCampaignStatus(
              resolved.campaignId,
              "RUNNING",
            );
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

        const isNewAttempt = resolved.status !== "CALLING" || !resolved.startedAt;
        const currentHistory: CallHistoryItem[] = [
          ...((resolved.callHistory as CallHistoryItem[]) ?? []),
        ];

        // Guard against out-of-order in-flight event from an earlier attempt
        let incomingAttempt: number | null = null;
        if (
          payload.batch_run_details?.retried !== undefined &&
          payload.batch_run_details.retried !== null
        ) {
          incomingAttempt = payload.batch_run_details.retried + 1;
        } else if (
          payload.retry_count !== undefined &&
          payload.retry_count !== null
        ) {
          incomingAttempt = payload.retry_count + 1;
        }

        const latestRecordedAttempt =
          currentHistory.length > 0
            ? Math.max(...currentHistory.map((h) => h.attempt ?? 0))
            : 0;

        if (incomingAttempt !== null && incomingAttempt < latestRecordedAttempt) {
          this.logger?.warn("Ignored out-of-order in-flight event from earlier attempt", {
            callId: resolved.id,
            incomingAttempt,
            latestRecordedAttempt,
            incomingState: state,
          });
          break;
        }

        const eventTimestamp = parseBolnaTimestamp(
          payload.initiated_at ??
            payload.telephony_data?.start_time ??
            payload.created_at ??
            payload.at,
        );

        if (
          resolved.status === "SCHEDULED" &&
          resolved.endedAt &&
          eventTimestamp &&
          eventTimestamp.getTime() <= resolved.endedAt.getTime()
        ) {
          this.logger?.warn(
            "Ignored out-of-order in-flight event timestamped before last attempt ended",
            {
              callId: resolved.id,
              eventTimestamp: eventTimestamp.toISOString(),
              lastAttemptEndedAt: resolved.endedAt.toISOString(),
            },
          );
          break;
        }

        const attemptStartTime = resolveAttemptStartTime(
          payload,
          resolved.startedAt,
          isNewAttempt,
        );

        let attemptNumber: number;
        if (incomingAttempt !== null) {
          attemptNumber = incomingAttempt;
        } else if (
          !isNewAttempt &&
          currentHistory.length > 0 &&
          currentHistory[currentHistory.length - 1].status === "CALLING"
        ) {
          attemptNumber = currentHistory[currentHistory.length - 1].attempt;
        } else {
          attemptNumber = currentHistory.length + 1;
        }

        const existingAttemptIdx = currentHistory.findIndex(
          (h) => h.attempt === attemptNumber,
        );
        if (existingAttemptIdx >= 0) {
          currentHistory[existingAttemptIdx] = {
            ...currentHistory[existingAttemptIdx],
            status: "CALLING",
            startedAt:
              currentHistory[existingAttemptIdx].startedAt ??
              attemptStartTime.toISOString(),
            endedAt: null,
          };
        } else {
          currentHistory.push({
            attempt: attemptNumber,
            bolnaCallId: callId,
            status: "CALLING",
            startedAt: attemptStartTime.toISOString(),
            endedAt: null,
            timestamp: attemptStartTime.toISOString(),
          });
        }

        const agentNumber =
          payload.agent_number ??
          payload.telephony_data?.from_number ??
          null;

        await this.webhookRepo.updateCallStatusAndHistory(
          resolved.id,
          callId,
          "CALLING",
          currentHistory,
          agentNumber,
          {
            startedAt: attemptStartTime,
            endedAt: null,
          },
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
          await this.webhookRepo.updateCampaignStatus(
            resolved.campaignId,
            "RUNNING",
            new Date(),
          );
        }

        if (this.stopBatchesOnInsufficientBalance) {
          this.stopBatchesOnInsufficientBalance
            .execute({ tenantId: resolved.tenantId })
            .catch((err) =>
              this.logger?.error(
                "Credit limit check failed during call webhook",
                err,
                {
                  action: "webhook.call.credit_check",
                  tenantId: resolved.tenantId,
                  callId: resolved.id,
                },
              ),
            );
        }
        break;
      }

      case "completed":
      case "ended":
      case "call-completed": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;

        await this.callCompletion.handleCallCompleted(resolved, payload, callId);
        break;
      }

      case "no-answer": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;
        await this.callTerminal.handleCallTerminal(resolved, "NO_ANSWER", payload);
        break;
      }

      case "busy": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;
        await this.callTerminal.handleCallTerminal(resolved, "BUSY", payload);
        break;
      }

      case "failed":
      case "error":
      case "balance-low": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;
        await this.callTerminal.handleCallTerminal(resolved, "FAILED", payload);
        break;
      }

      case "stopped":
      case "canceled": {
        const resolved = await this.callResolver.resolveCallRecord(callId, payload);
        if (!resolved) break;
        await this.callTerminal.handleCallCanceled(resolved);
        break;
      }
    }
  }
}
