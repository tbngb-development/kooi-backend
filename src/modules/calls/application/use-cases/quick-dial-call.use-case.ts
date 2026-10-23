// modules/calls/application/use-cases/quick-dial-call.use-case.ts

import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import type { ICallWalletGuard } from "../../../wallet/application/guards/call-wallet.guard";
import type { AssistantRepository } from "../../../assistants/application/interfaces/assistant-repository.interface";
import type { LeadRepository } from "../../../leads/application/interfaces/lead-repository.interface";
import type { CallRepository } from "../interfaces/call-repository.interface";
import type { IPhoneNumberRepository } from "../../../phone-numbers/application/interfaces/phone-number-repository.interface";
import {
  AssistantNotFoundError,
  BolnaAgentNotFoundError,
} from "../../../assistants/domain/errors/assistant.errors";
import { normalizePhoneNumber } from "../../../leads/domain/rules/phone.rules";
import { cleanCustomerName } from "../../../leads/domain/rules/name.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { resolveWelcomeMessage } from "../../../assistants/domain/rules/assistant-variable.rules";
import { AppError } from "../../../../shared/errors/app.error";

// ─── Input / Output Types ────────────────────────────────────────────────────

export interface QuickDialCallInput {
  tenantId: string;
  assistantId: string;
  phone: string;
  name?: string;
  fromPhoneNumber?: string;
}

export interface QuickDialCallOutput {
  callId: string;
  executionId: string;
  leadId: string;
  status: string;
  phone: string;
}

// ─── Use Case ────────────────────────────────────────────────────────────────

export class QuickDialCallUseCase {
  constructor(
    private readonly bolnaClientFactory: IBolnaClientFactory,
    private readonly callWalletGuard: ICallWalletGuard,
    private readonly assistantRepo: AssistantRepository,
    private readonly leadRepo: LeadRepository,
    private readonly callRepo: CallRepository,
    private readonly phoneNumberRepo: IPhoneNumberRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(input: QuickDialCallInput): Promise<QuickDialCallOutput> {
    const normalizedPhone = normalizePhoneNumber(input.phone);

    this.logger?.info("Initiating quick dial call", {
      action: "calls.quick_dial.start",
      tenantId: input.tenantId,
      assistantId: input.assistantId,
      phone: normalizedPhone,
    });

    // 1. Verify assistant ownership and active blueprint
    const assistant = await this.assistantRepo.findByIdWithPlatformAgent(
      input.tenantId,
      input.assistantId,
    );

    if (!assistant) {
      throw new AssistantNotFoundError();
    }

    if (!assistant.platformAgent?.bolnaId) {
      throw new BolnaAgentNotFoundError(
        "Assistant does not have an active Bolna agent blueprint",
      );
    }

    // 2. Validate tenant wallet balance
    await this.callWalletGuard.assertSufficientBalance(input.tenantId);

    // 3. Validate fromPhoneNumber (if provided)
    let validatedFromPhone: string | undefined;

    if (input.fromPhoneNumber) {
      validatedFromPhone = await this.validateOutboundPhone(
        input.fromPhoneNumber,
        input.tenantId,
      );
    }

    // 4. Create Lead record
    const customerName = input.name ? cleanCustomerName(input.name) : null;
    const lead = await this.leadRepo.createQuickDialLead({
      phone: normalizedPhone,
      name: customerName,
      tenantId: input.tenantId,
      assistantId: assistant.id,
    });

    // 5. Dispatch outbound call to Bolna
    const bolnaClient = await this.bolnaClientFactory.forTenant(input.tenantId);

    const outboundConfig = assistant.variables?.outbound;
    const assistantOutboundVars = outboundConfig?.variables ?? {};

    const defaultFallback =
      assistant.platformAgent.welcomeMessage ||
      `Hi, thanks for taking my call.`;

    const evaluatedWelcome = resolveWelcomeMessage(
      outboundConfig?.welcomeMessage,
      assistantOutboundVars,
      defaultFallback,
    );

    const userData: Record<string, string> = {
      ...assistantOutboundVars,
      ...(customerName ? { customer_name: customerName } : {}),
      ...(evaluatedWelcome ? { welcome_message: evaluatedWelcome } : {}),
    };

    let bolnaRes;
    try {
      bolnaRes = await bolnaClient.calls.create({
        agent_id: assistant.platformAgent.bolnaId,
        recipient_phone_number: normalizedPhone,
        ...(validatedFromPhone
          ? { from_phone_number: validatedFromPhone }
          : {}),
        user_data: userData,
      });
    } catch (err) {
      await this.leadRepo.updateStatus(lead.id, "FAILED");

      this.logger?.error("Failed to initiate Bolna call for quick dial", err, {
        action: "calls.quick_dial.bolna_error",
        tenantId: input.tenantId,
        leadId: lead.id,
      });
      throw err;
    }

    const executionId = bolnaRes.execution_id ?? bolnaRes.id;
    const resolvedAgentNumber =
      (bolnaRes as any)?.from_phone_number ??
      (bolnaRes as any)?.agent_number ??
      validatedFromPhone ??
      null;

    // 6. Create Call record
    const call = await this.callRepo.createQuickDialCallRecord({
      bolnaCallId: executionId,
      tenantId: input.tenantId,
      assistantId: assistant.id,
      leadId: lead.id,
      agentNumber: resolvedAgentNumber
        ? normalizePhoneNumber(resolvedAgentNumber)
        : null,
    });

    this.logger?.info("Quick dial call initiated and tracked", {
      action: "calls.quick_dial.success",
      callId: call.id,
      executionId,
      leadId: lead.id,
      tenantId: input.tenantId,
    });

    return {
      callId: call.id,
      executionId,
      leadId: lead.id,
      status: bolnaRes.status ?? "queued",
      phone: normalizedPhone,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private async validateOutboundPhone(
    rawPhone: string,
    tenantId: string,
  ): Promise<string> {
    const normalized = normalizePhoneNumber(rawPhone);
    const phoneRecord =
      await this.phoneNumberRepo.findByPhoneNumber(normalized);

    if (!phoneRecord) {
      throw new AppError(
        422,
        `Phone number ${normalized} is not registered in the system.`,
        "INVALID_OUTBOUND_PHONE",
      );
    }

    if (phoneRecord.tenantId !== tenantId) {
      throw new AppError(
        422,
        `Phone number ${normalized} does not belong to your workspace.`,
        "INVALID_OUTBOUND_PHONE",
      );
    }

    if (phoneRecord.status !== "ACTIVE") {
      throw new AppError(
        422,
        `Phone number ${normalized} is currently ${phoneRecord.status.toLowerCase()}. Only active numbers can be used for outbound calls.`,
        "INVALID_OUTBOUND_PHONE",
      );
    }

    if (
      phoneRecord.capabilities !== "OUTBOUND" &&
      phoneRecord.capabilities !== "BOTH"
    ) {
      throw new AppError(
        422,
        `Phone number ${normalized} only supports ${phoneRecord.capabilities.toLowerCase()} calls. An outbound-capable number is required.`,
        "INVALID_OUTBOUND_PHONE",
      );
    }

    return normalized;
  }
}
