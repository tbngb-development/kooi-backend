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
    _payload?: WebhookCallPayload,
  ): Promise<void> {
    const retryConfig = call.retryConfig ?? call.campaignDefaultRetryConfig;
    const currentAttempts =
      (call.callHistory as CallHistoryItem[])?.length ?? 0;

    let isBatchStopped = false;
    if (call.batchId) {
      const batchStatus = await this.webhookRepo.findBatchStatusById(call.batchId);
      if (batchStatus === "STOPPED") {
        isBatchStopped = true;
      }
    }

    const { willRetry, finalCallStatus, leadStatus } = evaluateCallRetry({
      isBatchStopped,
      retryConfig,
      currentAttempts,
      status,
    });

    await this.webhookRepo.updateCallTerminalState(call.id, {
      status: finalCallStatus,
      endedAt: new Date(),
    });

    await this.webhookRepo.updateLeadStatus(call.leadId, leadStatus);

    const isAlreadyTerminal = isTerminalCallStatus(call.status);
    if (!isAlreadyTerminal) {
      await this.webhookRepo.incrementTerminalStats(
        call.campaignId,
        call.batchId,
        status,
      );
    }

    this.logger?.debug("Call terminal handled", {
      action: "webhook.call.terminal",
      callId: call.id,
      tenantId: call.tenantId,
      status: finalCallStatus,
      leadStatus,
      willRetry,
    });

    await this.callLifecycle.checkBatchAndCampaignCompletion(call);
  }

  /**
   * Handles canceled or stopped calls, gracefully updating states.
   */
  async handleCallCanceled(call: ResolvedCallContext): Promise<void> {
    if (call.status === "STOPPED") return;

    await this.webhookRepo.updateCallTerminalState(call.id, {
      status: "STOPPED",
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
