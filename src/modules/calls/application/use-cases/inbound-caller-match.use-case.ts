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

    if (matchResult) {
      const { lead, campaign } = matchResult;

      // Create or update call record for this inbound execution
      await this.createInboundCallRecord({
        bolnaCallId: input.executionId,
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        leadId: lead.id,
        batchId: lead.batchId,
      });

      // Build response with campaign variables and dynamic welcome message
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

      this.logger?.info("Inbound caller matched in campaign context", {
        action: "inbound.caller_match.campaign_found",
        agentId: input.agentId,
        executionId: input.executionId,
        leadId: lead.id,
        campaignId: campaign.id,
        tenantId: campaign.tenantId,
      });

      return response;
    }

    // 2. Caller not found in an active campaign -> Auto-register lead under Assistant's Tenant
    const assistant = await prisma.assistant.findFirst({
      where: {
        platformAgent: { bolnaId: input.agentId },
        isDeleted: false,
      },
      include: {
        platformAgent: true,
      },
    });

    if (!assistant) {
      this.logger?.warn("Inbound caller agent not found in any tenant assistant", {
        action: "inbound.caller_match.no_assistant",
        agentId: input.agentId,
        contactNumber: normalizedPhone,
      });
      return this.buildUnknownCallerResponse(normalizedPhone);
    }

    // Check if lead already exists in tenant (e.g. from prior inbound or quick-dial call)
    const digits = normalizedPhone.replace(/\D/g, "");
    const last10 = digits.slice(-10);
    const candidatePhones = Array.from(
      new Set([normalizedPhone, `+91${last10}`, `91${last10}`, last10]),
    ).filter(Boolean);

    let lead = await prisma.lead.findFirst({
      where: {
        tenantId: assistant.tenantId,
        phone: { in: candidatePhones },
        isDeleted: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          phone: normalizedPhone,
          tenantId: assistant.tenantId,
          assistantId: assistant.id,
          type: "INBOUND",
          source: "INBOUND",
          status: "CALLING",
        },
      });

      this.logger?.info("Registered new inbound Lead record", {
        action: "inbound.caller_match.new_lead_registered",
        leadId: lead.id,
        tenantId: assistant.tenantId,
        phone: normalizedPhone,
      });
    } else {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "CALLING" },
      });
    }

    // Create Inbound Call record
    await this.createInboundCallRecord({
      bolnaCallId: input.executionId,
      tenantId: assistant.tenantId,
      assistantId: assistant.id,
      leadId: lead.id,
    });

    const formattedName = cleanCustomerName(lead.name);
    const hasCustomerName = Boolean(
      formattedName && isValidCustomerName(formattedName),
    );

    const config = (assistant.config ?? {}) as Record<string, unknown>;
    const agentName = assistant.name || "Sara";
    const welcomeMessage =
      (config.welcome_message as string) ||
      (config.welcomeMessage as string) ||
      `Hi, this is ${agentName}. Thanks for calling! How may I help you?`;

    this.logger?.info("Inbound caller processed and call record registered", {
      action: "inbound.caller_match.registered",
      agentId: input.agentId,
      executionId: input.executionId,
      leadId: lead.id,
      tenantId: assistant.tenantId,
      assistantId: assistant.id,
    });

    return {
      is_known_lead: hasCustomerName,
      contact_number: normalizedPhone,
      customer_name: hasCustomerName ? formattedName : "",
      welcome_message: welcomeMessage,
    };
  }

  private async createInboundCallRecord(params: {
    bolnaCallId: string;
    tenantId: string;
    campaignId?: string | null;
    assistantId?: string | null;
    leadId: string;
    batchId?: string | null;
  }): Promise<void> {
    try {
      await prisma.call.upsert({
        where: { bolnaCallId: params.bolnaCallId },
        create: {
          bolnaCallId: params.bolnaCallId,
          tenantId: params.tenantId,
          campaignId: params.campaignId ?? null,
          assistantId: params.assistantId ?? null,
          leadId: params.leadId,
          batchId: params.batchId ?? null,
          type: "INBOUND",
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
      contact_number: contactNumber,
      customer_name: "",
      welcome_message:
        "Hi, this is Sara. Thanks for calling! Is this a good time to talk?",
    };
  }
}
