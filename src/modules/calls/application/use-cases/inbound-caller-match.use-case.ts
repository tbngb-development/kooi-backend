// modules/calls/application/use-cases/inbound-caller-match.use-case.ts

import type { Logger } from "../../../../shared/logging/logger.interface";
import {
  normalizePhoneNumber,
  isValidE164,
} from "../../../leads/domain/rules/phone.rules";
import {
  cleanCustomerName,
  isValidCustomerName,
} from "../../../leads/domain/rules/name.rules";
import { resolveWelcomeMessage } from "../../../assistants/domain/rules/assistant-variable.rules";
import type { AssistantVariablesConfig } from "../../../assistants/domain/types/assistant-variable.types";
import type { LeadRepository } from "../../../leads/application/interfaces/lead-repository.interface";
import type { AssistantRepository } from "../../../assistants/application/interfaces/assistant-repository.interface";
import type { CallRepository } from "../interfaces/call-repository.interface";
import type { ICallWalletGuard } from "../../../wallet/application/guards/call-wallet.guard";

// ─── Input / Output Types ────────────────────────────────────────────────────

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

export type InboundCallerMatchResult =
  InboundCallerMatchOutput | Record<string, never>;

// ─── Use Case ────────────────────────────────────────────────────────────────

export class InboundCallerMatchUseCase {
  constructor(
    private readonly assistantRepo: AssistantRepository,
    private readonly leadRepo: LeadRepository,
    private readonly callRepo: CallRepository,
    private readonly callWalletGuard: ICallWalletGuard,
    private readonly logger?: Logger,
  ) {}

  async execute(
    input: InboundCallerMatchInput,
  ): Promise<InboundCallerMatchResult> {
    const normalizedPhone = normalizePhoneNumber(input.contactNumber);

    if (!input.contactNumber || !isValidE164(normalizedPhone)) {
      this.logger?.warn("Inbound caller match rejected: invalid or missing contact number", {
        action: "inbound.caller_match.invalid_phone",
        contactNumber: input.contactNumber,
      });
      return {};
    }

    this.logger?.info("Inbound caller match request", {
      action: "inbound.caller_match",
      contactNumber: normalizedPhone,
      agentId: input.agentId,
      executionId: input.executionId,
    });

    // ── 1. Resolve Assistant via Bolna agent ID ──────────────────────────
    const assistant = await this.assistantRepo.findInboundByBolnaAgentId(
      input.agentId,
    );

    if (!assistant) {
      this.logger?.info(
        "Inbound call rejected: no active inbound assistant for agent",
        {
          action: "inbound.caller_match.rejected",
          agentId: input.agentId,
          contactNumber: normalizedPhone,
        },
      );
      return {};
    }

    // ── 1.1 Verify tenant wallet balance ────────────────────────────────
    const hasFunds = await this.callWalletGuard.hasSufficientBalance(
      assistant.tenantId,
    );
    if (!hasFunds) {
      this.logger?.warn(
        "Inbound call rejected: insufficient tenant wallet balance",
        {
          action: "inbound.caller_match.insufficient_balance",
          agentId: input.agentId,
          contactNumber: normalizedPhone,
          tenantId: assistant.tenantId,
        },
      );
      return {};
    }

    // ── 2. Find or create Lead (E.164 exact match) ──────────────────────
    const { lead, isNew } = await this.findOrCreateLead(
      normalizedPhone,
      assistant.tenantId,
      assistant.id,
    );

    // ── 3. Create Call record (non-blocking) ────────────────────────────
    await this.createCallRecord(
      input.executionId,
      assistant.tenantId,
      assistant.id,
      lead.id,
    );

    // ── 4. Build & return response ──────────────────────────────────────
    const response = this.buildResponse(
      normalizedPhone,
      lead,
      assistant,
      isNew,
    );

    this.logger?.info("Inbound caller processed", {
      action: "inbound.caller_match.success",
      agentId: input.agentId,
      executionId: input.executionId,
      leadId: lead.id,
      tenantId: assistant.tenantId,
      isNewLead: isNew,
    });

    return response;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private async findOrCreateLead(
    phone: string,
    tenantId: string,
    assistantId: string,
  ): Promise<{ lead: { id: string; name: string | null }; isNew: boolean }> {
    const existing = await this.leadRepo.findByTenantAndPhone(tenantId, phone);

    if (existing) {
      await this.leadRepo.updateStatus(existing.id, "CALLING");
      return { lead: existing, isNew: false };
    }

    const created = await this.leadRepo.createInboundLead({
      phone,
      tenantId,
      assistantId,
    });

    this.logger?.info("Registered new inbound lead", {
      action: "inbound.caller_match.new_lead",
      leadId: created.id,
      tenantId,
      phone,
    });

    return { lead: created, isNew: true };
  }

  private async createCallRecord(
    executionId: string,
    tenantId: string,
    assistantId: string,
    leadId: string,
  ): Promise<void> {
    try {
      await this.callRepo.createInboundCallRecord({
        bolnaCallId: executionId,
        tenantId,
        assistantId,
        leadId,
      });
    } catch (err) {
      this.logger?.error("Failed to create inbound call record", err, {
        action: "inbound.caller_match.call_record_failed",
        executionId,
        leadId,
      });
    }
  }

  private buildResponse(
    phone: string,
    lead: { id: string; name: string | null },
    assistant: {
      name: string;
      variables: unknown;
      platformAgent: { welcomeMessage: string | null };
    },
    isNewLead: boolean,
  ): InboundCallerMatchOutput {
    const assistantVars = (assistant.variables ??
      {}) as AssistantVariablesConfig;
    const inboundConfig = assistantVars.inbound;
    const inboundVariables = inboundConfig?.variables ?? {};

    const agentName =
      inboundVariables.agent_name ||
      inboundVariables.agentName ||
      assistant.name ||
      "Sara";

    const defaultFallback =
      assistant.platformAgent?.welcomeMessage ||
      `Hi, this is ${agentName}. Thanks for calling! How may I help you?`;

    const welcomeMessage = resolveWelcomeMessage(
      inboundConfig?.welcomeMessage,
      inboundVariables,
      defaultFallback,
    );

    const formattedName = cleanCustomerName(lead.name);
    const hasCustomerName = Boolean(
      formattedName && isValidCustomerName(formattedName),
    );

    const response: InboundCallerMatchOutput = {
      is_known_lead: !isNewLead && hasCustomerName,
      contact_number: phone,
      customer_name: hasCustomerName ? formattedName : "",
      welcome_message: welcomeMessage,
    };

    for (const [key, value] of Object.entries(inboundVariables)) {
      if (!response[key]) {
        response[key] = value;
      }
    }

    return response;
  }
}
