import type { WebhookRepository } from "../interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../dto/webhook.dto";
import { WebhookResolutionError } from "../../domain/errors/webhook.errors";
import type { StopBatchesOnInsufficientBalanceUseCase } from "../../../wallet/application/use-cases/stop-batches-on-insufficient-balance.use-case";
import type { CallResolverService } from "../services/call-resolver.service";
import type { CallCompletionService } from "../services/call-completion.service";
import type { CallTerminalService } from "../services/call-terminal.service";
import { mapLastRetryToLeadStatus } from "../../domain/rules/call-retry.rules";
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
          if (!canTransitionCallStatus(resolved.status, "SCHEDULED")) {
            this.logger?.warn("Ignored out-of-order scheduled event on terminal call", {
              callId: resolved.id,
              currentStatus: resolved.status,
            });
            break;
          }

          await this.webhookRepo.updateCallTerminalState(resolved.id, {
            status: "SCHEDULED",
          });

          const lastRetry =
            payload.retry_history?.[payload.retry_history.length - 1];
          if (lastRetry?.status) {
            const leadStatus = mapLastRetryToLeadStatus(lastRetry.status);
            await this.webhookRepo.updateLeadStatus(resolved.leadId, leadStatus);
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

        await this.webhookRepo.updateCallStatusAndHistory(
          resolved.id,
          callId,
          "CALLING",
          [],
        );

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

        await this.webhookRepo.updateCampaignStatus(
          resolved.campaignId,
          "RUNNING",
          new Date(),
        );

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
