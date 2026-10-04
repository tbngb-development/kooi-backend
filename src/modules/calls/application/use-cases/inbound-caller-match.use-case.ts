import type { CallRepository } from "../interfaces/call-repository.interface";
import {
  cleanCustomerName,
  isValidCustomerName,
} from "../../../leads/domain/rules/name.rules";
import { normalizePhoneNumber } from "../../../leads/domain/rules/phone.rules";
import prisma from "../../../../shared/config/database/prisma";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface InboundCallerMatchInput {
  contactNumber: string;
  agentId: string;
  executionId: string;
}

export interface InboundCallerMatchOutput {
  is_known_lead: boolean;
  contact_number: string;
  customer_name: string;
  welcome_message: string;
  [key: string]: string | boolean;
}

export class InboundCallerMatchUseCase {
  constructor(
    private readonly callRepo: CallRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(
    input: InboundCallerMatchInput,
  ): Promise<InboundCallerMatchOutput> {
    const normalizedPhone = normalizePhoneNumber(input.contactNumber);

    this.logger?.info("Inbound caller match request", {
      action: "inbound.caller_match",
      contactNumber: normalizedPhone,
      agentId: input.agentId,
      executionId: input.executionId,
    });

    // 1. Lookup lead & campaign using agent_id + caller phone
    const matchResult = await this.callRepo.findInboundLeadContext(
      input.agentId,
      normalizedPhone,
    );

    if (!matchResult) {
      this.logger?.warn("Inbound caller not found in system", {
        action: "inbound.caller_match.unknown",
        agentId: input.agentId,
        contactNumber: normalizedPhone,
      });

      return this.buildUnknownCallerResponse(normalizedPhone);
    }

    // 2. Update existing call record's bolnaCallId to the new inbound execution_id
    //    This ensures all subsequent webhook events (ringing, in-progress, completed)
    //    resolve instantly via findCallByBolnaCallId(execution_id).
    await this.linkExecutionIdToCallRecord(
      matchResult.lead.id,
      matchResult.campaign.id,
      input.executionId,
    );

    // 3. Build response with campaign variables and dynamic welcome message
    const { lead, campaign } = matchResult;
    const campaignVariables = campaign.variables ?? {};
    const leadMetadata = (lead.metadata ?? {}) as Record<string, string>;

    const agentName =
      campaignVariables.agent_name || campaignVariables.agentName || "Sara";

    const builderName =
      campaignVariables.builder_name ||
      campaignVariables.company_name ||
      campaignVariables.company ||
      lead.company ||
      "our team";

    const formattedName = cleanCustomerName(lead.name);
    const hasCustomerName = isValidCustomerName(lead.name);

    // 4. Dynamic Inbound Callback Welcome Message
    const welcomeMessage = `Hi, this is ${agentName} from ${builderName}. How may I help you?`;

    const response: InboundCallerMatchOutput = {
      is_known_lead: true,
      contact_number: normalizePhoneNumber(lead.phone),
      customer_name: hasCustomerName ? formattedName : "",
      welcome_message: welcomeMessage,
    };

    for (const [key, value] of Object.entries(campaignVariables)) {
      if (!response[key]) {
        response[key] = value;
      }
    }

    for (const [key, value] of Object.entries(leadMetadata)) {
      if (
        !response[key] &&
        !["phone", "name", "email", "company"].includes(key.toLowerCase())
      ) {
        response[key] = String(value ?? "");
      }
    }

    this.logger?.info("Inbound caller matched successfully", {
      action: "inbound.caller_match.found",
      agentId: input.agentId,
      executionId: input.executionId,
      leadId: lead.id,
      campaignId: campaign.id,
      tenantId: campaign.tenantId,
    });

    return response;
  }

  /**
   * Links the new inbound execution_id to the existing outbound call record.
   *
   * Strategy:
   * 1. Find the most recent call for this lead in this campaign
   * 2. If found and its bolnaCallId differs from the new execution_id:
   *    - Push the old bolnaCallId into callHistory for audit trail
   *    - Replace bolnaCallId with the new inbound execution_id
   * 3. If no existing call found, do nothing (webhook will create one)
   */
  private async linkExecutionIdToCallRecord(
    leadId: string,
    campaignId: string,
    newExecutionId: string,
  ): Promise<void> {
    try {
      const existingCall = await prisma.call.findFirst({
        where: {
          leadId,
          campaignId,
          isDeleted: false,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!existingCall) {
        this.logger?.debug("No existing call record to link", {
          action: "inbound.caller_match.no_call_record",
          leadId,
          campaignId,
        });
        return;
      }

      if (existingCall.bolnaCallId === newExecutionId) {
        return; // Already linked
      }

      // Preserve old bolnaCallId in call history
      const history =
        (existingCall.callHistory as Array<{
          attempt: number;
          bolnaCallId: string;
          status: string;
          duration: number | null;
          cost: number | null;
          timestamp: string;
        }>) ?? [];

      if (existingCall.bolnaCallId) {
        history.push({
          attempt: history.length + 1,
          bolnaCallId: existingCall.bolnaCallId,
          status: existingCall.status,
          duration: existingCall.duration,
          cost: existingCall.cost,
          timestamp: existingCall.updatedAt.toISOString(),
        });
      }

      await prisma.call.update({
        where: { id: existingCall.id },
        data: {
          bolnaCallId: newExecutionId,
          callHistory: history,
        },
      });

      this.logger?.info("Inbound execution_id linked to call record", {
        action: "inbound.caller_match.linked",
        callId: existingCall.id,
        leadId,
        oldBolnaCallId: existingCall.bolnaCallId,
        newExecutionId,
      });
    } catch (err) {
      // Non-fatal: if linking fails, the webhook fallback will still resolve
      this.logger?.error("Failed to link execution_id to call record", err, {
        action: "inbound.caller_match.link_failed",
        leadId,
        campaignId,
        newExecutionId,
      });
    }
  }

  private buildUnknownCallerResponse(
    contactNumber: string,
  ): InboundCallerMatchOutput {
    return {
      is_known_lead: false,
      contact_number: contactNumber,
      customer_name: "",
      welcome_message:
        "Hi, this is Sara. Thanks for calling! Is this a good time to talk?",
    };
  }
}
