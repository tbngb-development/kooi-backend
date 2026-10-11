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
  toNumber?: string;
}

export interface InboundCallerMatchOutput {
  is_known_lead: boolean;
  contact_number: string;
  customer_name: string;
  welcome_message: string;
  is_active?: boolean;
  [key: string]: string | boolean | undefined;
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
      toNumber: input.toNumber,
    });

    // 1. Resolve Inbound Number by dialed number or agent bolna ID
    const inboundNumber = await this.callRepo.findInboundNumber(
      input.agentId,
      input.toNumber,
    );

    if (inboundNumber) {
      // Suspension / Inactivity Guard
      if (inboundNumber.status !== "ACTIVE") {
        this.logger?.warn("Inbound number not active or suspended", {
          action: "inbound.caller_match.inactive_number",
          inboundNumberId: inboundNumber.id,
          status: inboundNumber.status,
          contactNumber: normalizedPhone,
        });

        return {
          is_known_lead: false,
          is_active: false,
          contact_number: normalizedPhone,
          customer_name: "",
          welcome_message:
            "This phone line is currently unavailable. Please try again later.",
        };
      }

      // Resolve or create lead under tenant
      let lead = await this.callRepo.findTenantLeadByPhone(
        inboundNumber.tenantId,
        normalizedPhone,
      );

      if (!lead) {
        const created = await this.callRepo.createInboundLead({
          tenantId: inboundNumber.tenantId,
          phone: normalizedPhone,
          name: "Inbound Caller",
        });

        lead = {
          id: created.id,
          name: "Inbound Caller",
          phone: normalizedPhone,
          email: null,
          company: null,
          metadata: null,
        };
      }

      // Create or upsert Call record for this execution
      await this.createInboundCallRecord({
        bolnaCallId: input.executionId,
        tenantId: inboundNumber.tenantId,
        assistantId: inboundNumber.assistantId,
        inboundNumberId: inboundNumber.id,
        leadId: lead.id,
      });

      const assistant = inboundNumber.assistant;
      const assistantConfig = (assistant?.config ?? {}) as Record<string, string>;
      const platformAgent = assistant?.platformAgent;
      const agentName = assistant?.name ?? "Sara";

      const formattedName = cleanCustomerName(lead.name);
      const hasCustomerName = Boolean(
        formattedName &&
          isValidCustomerName(formattedName) &&
          formattedName !== "Inbound Caller",
      );

      let welcomeMessage =
        platformAgent?.welcomeMessage ||
        assistantConfig.welcome_message ||
        `Hi, this is ${agentName}. How may I help you today?`;

      if (hasCustomerName && formattedName) {
        welcomeMessage = `Hi ${formattedName}, this is ${agentName}. How may I help you today?`;
      }

      const response: InboundCallerMatchOutput = {
        is_known_lead: hasCustomerName,
        is_active: true,
        contact_number: normalizedPhone,
        customer_name: hasCustomerName && formattedName ? formattedName : "",
        welcome_message: welcomeMessage,
      };

      for (const [key, value] of Object.entries(assistantConfig)) {
        if (!response[key]) {
          response[key] = String(value ?? "");
        }
      }

      this.logger?.info("Inbound caller matched via InboundNumber", {
        action: "inbound.caller_match.found_inbound_number",
        inboundNumberId: inboundNumber.id,
        tenantId: inboundNumber.tenantId,
        assistantId: inboundNumber.assistantId,
        leadId: lead.id,
        executionId: input.executionId,
      });

      return response;
    }

    // 2. Legacy Campaign Fallback: Lookup lead & campaign using agent_id + caller phone
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

    // CREATE CALL RECORD for campaign inbound execution
    await this.createInboundCallRecord({
      bolnaCallId: input.executionId,
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
      leadId: lead.id,
      batchId: lead.batchId,
    });

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
    const hasCustomerName = Boolean(
      formattedName && isValidCustomerName(formattedName),
    );

    const welcomeMessage = `Hi, this is ${agentName} from ${builderName}. How may I help you?`;

    const response: InboundCallerMatchOutput = {
      is_known_lead: true,
      is_active: true,
      contact_number: normalizePhoneNumber(lead.phone),
      customer_name: hasCustomerName && formattedName ? formattedName : "",
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
      action: "inbound.caller_match.found_campaign",
      agentId: input.agentId,
      executionId: input.executionId,
      leadId: lead.id,
      campaignId: campaign.id,
      tenantId: campaign.tenantId,
    });

    return response;
  }

  private async createInboundCallRecord(params: {
    bolnaCallId: string;
    tenantId: string;
    assistantId?: string | null;
    inboundNumberId?: string | null;
    campaignId?: string | null;
    leadId: string;
    batchId?: string | null;
  }): Promise<void> {
    try {
      // Upsert safe against duplicate caller-match hits
      await prisma.call.upsert({
        where: { bolnaCallId: params.bolnaCallId },
        create: {
          bolnaCallId: params.bolnaCallId,
          tenantId: params.tenantId,
          assistantId: params.assistantId ?? null,
          inboundNumberId: params.inboundNumberId ?? null,
          campaignId: params.campaignId ?? null,
          leadId: params.leadId,
          batchId: params.batchId ?? null,
          source: "INBOUND",
          status: "CALLING",
          startedAt: new Date(),
        },
        update: {},
      });

      await prisma.lead.update({
        where: { id: params.leadId },
        data: { status: "CALLING" },
      });
    } catch (err) {
      this.logger?.error("Failed to create new inbound call record", err, {
        action: "inbound.caller_match.create_call_failed",
        bolnaCallId: params.bolnaCallId,
        leadId: params.leadId,
      });
    }
  }

  private buildUnknownCallerResponse(
    contactNumber: string,
  ): InboundCallerMatchOutput {
    return {
      is_known_lead: false,
      is_active: true,
      contact_number: contactNumber,
      customer_name: "",
      welcome_message:
        "Hi, this is Sara. Thanks for calling! Is this a good time to talk?",
    };
  }
}
