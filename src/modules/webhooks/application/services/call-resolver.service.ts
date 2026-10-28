import prisma from "../../../../shared/config/database/prisma";
import type {
  WebhookRepository,
  ResolvedCallContext,
} from "../interfaces/webhook-repository.interface";
import type { WebhookCallPayload } from "../dto/webhook.dto";
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
    if (call) {
      const payloadAgentNumber =
        payload.agent_number ??
        (call.type === "OUTBOUND"
          ? payload.telephony_data?.from_number
          : payload.telephony_data?.to_number) ??
        null;
      if (!call.agentNumber && payloadAgentNumber) {
        await this.webhookRepo.updateCallTerminalState(call.id, {
          status: call.status,
          agentNumber: payloadAgentNumber,
        });
        call.agentNumber = payloadAgentNumber;
      }
      return call;
    }

    const bolnaBatchId = payload.batch_id;
    const isOutbound = payload.telephony_data?.call_type !== "inbound";
    const phone = isOutbound
      ? (payload.telephony_data?.to_number ??
         payload.context_details?.recipient_phone_number ??
         payload.user_number)
      : (payload.telephony_data?.from_number ??
         payload.user_number);
    const retried = payload.batch_run_details?.retried ?? 0;

    if (!bolnaBatchId && payload.agent_id && phone) {
      // Non-batch call fallback (Quick Dial or Inbound)
      const callType = isOutbound ? "OUTBOUND" : "INBOUND";
      const callSource = isOutbound ? "QUICK_DIAL" : "INBOUND";
      const agentNumber =
        payload.agent_number ??
        (isOutbound
          ? payload.telephony_data?.from_number
          : payload.telephony_data?.to_number) ??
        null;

      let assistant: any = null;
      let targetTenantId: string | null = null;

      if (agentNumber) {
        const phoneRecord = await prisma.phoneNumber.findUnique({
          where: { phoneNumber: agentNumber },
          include: { assistant: true },
        });

        if (phoneRecord?.tenantId) {
          targetTenantId = phoneRecord.tenantId;
          assistant =
            phoneRecord.assistant ??
            (await prisma.assistant.findFirst({
              where: {
                tenantId: phoneRecord.tenantId,
                platformAgent: { bolnaId: payload.agent_id },
                isDeleted: false,
              },
            }));
        }
      }

      // Fail-secure: never fall back to an unscoped global assistant search
      if (!assistant || !targetTenantId) {
        this.logger?.warn(
          "Call resolution rejected: cannot establish tenant ownership without trusted batch, pre-created call, or mapped phone number",
          {
            action: "webhook.call_resolver.unresolvable_tenant",
            bolnaCallId,
            agentId: payload.agent_id,
            agentNumber,
            isOutbound,
          },
        );
        return null;
      }

      if (assistant && targetTenantId) {
        let lead = await prisma.lead.findFirst({
          where: {
            tenantId: targetTenantId,
            phone,
            isDeleted: false,
          },
          orderBy: { createdAt: "desc" },
        });

        if (!lead) {
          this.logger?.info("Creating new lead for webhook", {
            action: "webhook.call_resolver.lead_created",
            bolnaCallId,
            phone,
            tenantId: targetTenantId,
            assistantId: assistant.id,
            callType,
            callSource,
            agentNumber,
          });
          lead = await prisma.lead.create({
            data: {
              phone,
              tenantId: targetTenantId,
              assistantId: assistant.id,
              type: callType,
              source: callSource,
              status: "CALLING",
            },
          });
        }

        const newCall = await this.webhookRepo.createCall({
          bolnaCallId,
          tenantId: targetTenantId,
          assistantId: assistant.id,
          leadId: lead.id,
          type: callType,
          source: callSource,
          status: "CALLING",
          startedAt: new Date(),
          agentNumber,
        });

        await this.webhookRepo.updateLeadStatus(lead.id, "CALLING");
        return newCall;
      }
    }

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

    // If an earlier attempt exists and was left non-terminal, finalize it with previous status
    if (
      existingCall &&
      (existingCall.status === "SCHEDULED" ||
        existingCall.status === "CALLING" ||
        existingCall.status === "PENDING")
    ) {
      const lastRetryStatus =
        payload.retry_history?.[payload.retry_history.length - 1]?.status;
      const terminalStatus = lastRetryStatus
        ? lastRetryStatus.toLowerCase().includes("busy")
          ? "BUSY"
          : "NO_ANSWER"
        : "NO_ANSWER";

      await this.webhookRepo.updateCallTerminalState(existingCall.id, {
        status: terminalStatus,
        endedAt: new Date(),
      });
    }

    const agentNumber =
      payload.agent_number ??
      payload.telephony_data?.from_number ??
      null;

    const newCall = await this.webhookRepo.createCall({
      bolnaCallId,
      tenantId: batch.tenantId,
      campaignId: batch.campaignId,
      leadId: lead.id,
      batchId: batch.id,
      type: "OUTBOUND",
      source: "CAMPAIGN",
      status: "CALLING",
      startedAt: new Date(),
      agentNumber,
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
