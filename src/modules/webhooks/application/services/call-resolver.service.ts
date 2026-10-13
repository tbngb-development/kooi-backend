import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../dto/webhook.dto";
import type { CallHistoryItem } from "../../../../shared/types/bolna.types";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class CallResolverService {
  constructor(
    private readonly webhookRepo: WebhookRepository,
    private readonly logger?: Logger,
  ) {}

  /**
   * Resolves or provisions a call record based on Bolna call identifier,
   * falling back to batch run details and lead phone number if needed.
   */
  async resolveCallRecord(
    bolnaCallId: string,
    payload: WebhookCallPayload,
  ): Promise<ResolvedCallContext | null> {
    const call = await this.webhookRepo.findCallByBolnaCallId(bolnaCallId);
    if (call) return call;

    const bolnaBatchId = payload.batch_id;
    const phone =
      payload.telephony_data?.to_number ??
      payload.context_details?.recipient_phone_number;
    const retried = payload.batch_run_details?.retried ?? 0;

    if (!bolnaBatchId || !phone) return null;

    const batch = await this.webhookRepo.findBatchIdByBolnaBatchId(bolnaBatchId);
    if (!batch) return null;

    const lead =
      (await this.webhookRepo.findLeadByPhoneAndBatch(phone, batch.id)) ??
      (await this.webhookRepo.findLeadByPhoneAndCampaign(
        phone,
        batch.campaignId,
      ));

    if (!lead) return null;

    const existingCall = await this.webhookRepo.findCallByLeadAndBatch(
      lead.id,
      batch.id,
    );

    if (existingCall && (retried > 0 || existingCall.status === "SCHEDULED")) {
      const history = (existingCall.callHistory as CallHistoryItem[]) ?? [];

      const currentAttempt = retried > 0 ? retried : Math.max(1, history.length);

      // Idempotency guard: prevent duplicate history entries for repeated webhook attempts
      const alreadyRecorded = history.some(
        (h) => h.attempt === currentAttempt || h.bolnaCallId === bolnaCallId,
      );

      if (!alreadyRecorded && existingCall.bolnaCallId && existingCall.bolnaCallId !== bolnaCallId) {
        history.push({
          attempt: currentAttempt,
          bolnaCallId: existingCall.bolnaCallId,
          status: existingCall.status,
          duration: existingCall.duration,
          cost: existingCall.cost,
          timestamp: existingCall.updatedAt.toISOString(),
        });
      }

      return this.webhookRepo.updateCallStatusAndHistory(
        existingCall.id,
        bolnaCallId,
        "CALLING",
        history,
      );
    }

    if (existingCall && retried === 0) {
      return existingCall;
    }

    const newCall = await this.webhookRepo.createCall({
      bolnaCallId,
      tenantId: batch.tenantId,
      campaignId: batch.campaignId,
      leadId: lead.id,
      batchId: batch.id,
      status: "CALLING",
      startedAt: new Date(),
    });

    await this.webhookRepo.updateLeadStatus(lead.id, "CALLING");

    this.logger?.debug("Provisioned new call context for webhook", {
      action: "webhook.call_resolved_new",
      callId: newCall.id,
      bolnaCallId,
      leadId: lead.id,
    });

    return newCall;
  }
}
