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

    const { lead, campaign } = matchResult;

    // 2. CREATE A BRAND NEW CALL RECORD for this inbound execution
    //    Guarantees independent tracking, billing, transcript, and audio recording.
    await this.createInboundCallRecord(
      input.executionId,
      campaign.tenantId,
      campaign.id,
      lead.id,
      lead.batchId,
    );

    // 3. Build response with campaign variables and dynamic welcome message
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

    this.logger?.info("Inbound caller matched and new call created", {
      action: "inbound.caller_match.found",
      agentId: input.agentId,
      executionId: input.executionId,
      leadId: lead.id,
      campaignId: campaign.id,
      tenantId: campaign.tenantId,
    });

    return response;
  }

  private async createInboundCallRecord(
    bolnaCallId: string,
    tenantId: string,
    campaignId: string,
    leadId: string,
    batchId?: string | null,
  ): Promise<void> {
    try {
      // Upsert/Create safe against duplicate caller-match hits
      await prisma.call.upsert({
        where: { bolnaCallId },
        create: {
          bolnaCallId,
          tenantId,
          campaignId,
          leadId,
          batchId: batchId ?? null,
          status: "CALLING",
          startedAt: new Date(),
        },
        update: {},
      });

      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "CALLING" },
      });
    } catch (err) {
      this.logger?.error("Failed to create new inbound call record", err, {
        action: "inbound.caller_match.create_call_failed",
        bolnaCallId,
        leadId,
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
