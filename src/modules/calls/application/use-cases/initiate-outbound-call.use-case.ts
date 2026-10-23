// modules/calls/application/use-cases/initiate-outbound-call.use-case.ts

import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import type { AssistantRepository } from "../../../assistants/application/interfaces/assistant-repository.interface";
import type { LeadRepository } from "../../../leads/application/interfaces/lead-repository.interface";
import type { CallRepository } from "../interfaces/call-repository.interface";
import { getEffectiveAvailableBalance } from "../../../wallet/domain/rules/bonus-first-deduction.rules";
import {
  WalletNotFoundError,
  InsufficientBalanceError,
} from "../../../wallet/domain/errors/wallet.errors";
import {
  AssistantNotFoundError,
  BolnaAgentNotFoundError,
  PlatformAgentNotActiveError,
  AssistantNotConfiguredForOutboundError,
} from "../../../assistants/domain/errors/assistant.errors";
import { normalizePhoneNumber } from "../../../leads/domain/rules/phone.rules";
import { cleanCustomerName } from "../../../leads/domain/rules/name.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";
import { resolveWelcomeMessage } from "../../../assistants/domain/rules/assistant-variable.rules";
import { assertTenantNotFrozen } from "../../../../shared/utils/tenant-freeze.guard";
import type {
  InitiateOutboundCallInput,
  InitiateOutboundCallOutput,
} from "../dto/initiate-outbound-call.dto";

export class InitiateOutboundCallUseCase {
  constructor(
    private readonly bolnaClientFactory: IBolnaClientFactory,
    private readonly walletRepo: WalletRepository,
    private readonly assistantRepo: AssistantRepository,
    private readonly leadRepo: LeadRepository,
    private readonly callRepo: CallRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(
    input: InitiateOutboundCallInput,
  ): Promise<InitiateOutboundCallOutput> {
    const normalizedPhone = normalizePhoneNumber(input.phoneNumber);

    this.logger?.info("Initiating single tenant outbound call via API key", {
      action: "calls.outbound.start",
      tenantId: input.tenantId,
      assistantId: input.assistantId,
      phone: normalizedPhone,
    });

    // 0. Enforce workspace freeze guards (e.g. during migration / key deactivation)
    await assertTenantNotFrozen(input.tenantId);

    // 1. Verify assistant existence, ownership, active status, and outbound capability
    const assistant = await this.assistantRepo.findByIdWithPlatformAgent(
      input.tenantId,
      input.assistantId,
    );

    if (!assistant) {
      throw new AssistantNotFoundError();
    }

    if (assistant.platformAgent.isActive === false) {
      throw new PlatformAgentNotActiveError(assistant.platformAgent.id);
    }

    if (assistant.platformAgent.type === "INBOUND") {
      throw new AssistantNotConfiguredForOutboundError(input.assistantId);
    }

    if (!assistant.platformAgent.bolnaId) {
      throw new BolnaAgentNotFoundError(
        "Assistant does not have an active Bolna agent blueprint",
      );
    }

    // 2. Validate tenant wallet balance
    const wallet = await this.walletRepo.findByTenantId(input.tenantId);
    if (!wallet) {
      throw new WalletNotFoundError(input.tenantId);
    }

    const availableBalance = getEffectiveAvailableBalance(wallet);
    if (availableBalance <= 0) {
      throw new InsufficientBalanceError(
        "Insufficient wallet balance to place an outbound call. Please recharge your wallet.",
      );
    }

    // 3. Create Lead record for this call
    const customerName = input.name ? cleanCustomerName(input.name) : null;
    const lead = await this.leadRepo.createQuickDialLead({
      phone: normalizedPhone,
      name: customerName,
      tenantId: input.tenantId,
      assistantId: assistant.id,
    });

    // 4. Resolve outbound dynamic variables & welcome message
    const bolnaClient = await this.bolnaClientFactory.forTenant(input.tenantId);

    const outboundConfig = assistant.variables?.outbound;
    const assistantOutboundVars = outboundConfig?.variables ?? {};

    const defaultFallback =
      assistant.platformAgent.welcomeMessage ||
      "Hi, thanks for taking my call.";

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

    // 5. Dispatch call to Bolna
    let bolnaRes;
    try {
      bolnaRes = await bolnaClient.calls.create({
        agent_id: assistant.platformAgent.bolnaId,
        recipient_phone_number: normalizedPhone,
        user_data: userData,
      });
    } catch (err) {
      await this.leadRepo.updateStatus(lead.id, "FAILED");

      this.logger?.error("Failed to initiate Bolna call for tenant outbound call", err, {
        action: "calls.outbound.bolna_error",
        tenantId: input.tenantId,
        leadId: lead.id,
      });
      throw err;
    }

    const executionId = bolnaRes.execution_id ?? bolnaRes.id;
    const resolvedAgentNumber =
      (bolnaRes as any)?.from_phone_number ??
      (bolnaRes as any)?.agent_number ??
      null;

    // 6. Create Call tracking record
    const call = await this.callRepo.createQuickDialCallRecord({
      bolnaCallId: executionId,
      tenantId: input.tenantId,
      assistantId: assistant.id,
      leadId: lead.id,
      agentNumber: resolvedAgentNumber
        ? normalizePhoneNumber(resolvedAgentNumber)
        : null,
    });

    this.logger?.info("Tenant outbound call initiated successfully", {
      action: "calls.outbound.success",
      callId: call.id,
      executionId,
      leadId: lead.id,
      tenantId: input.tenantId,
    });

    return {
      callId: call.id,
      status: bolnaRes.status ?? "queued",
    };
  }
}
