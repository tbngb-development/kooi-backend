import prisma from "../../../../shared/config/database/prisma";
import type { Prisma } from "@prisma/client";
import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import type { WalletRepository } from "../../../wallet/application/interfaces/wallet-repository.interface";
import { getEffectiveAvailableBalance } from "../../../wallet/domain/rules/bonus-first-deduction.rules";
import {
  WalletNotFoundError,
  InsufficientBalanceError,
} from "../../../wallet/domain/errors/wallet.errors";
import {
  AssistantNotFoundError,
  BolnaAgentNotFoundError,
} from "../../../assistants/domain/errors/assistant.errors";
import { normalizePhoneNumber } from "../../../leads/domain/rules/phone.rules";
import { cleanCustomerName } from "../../../leads/domain/rules/name.rules";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface QuickDialCallInput {
  tenantId: string;
  assistantId: string;
  phone: string;
  name?: string;
  userData?: Record<string, string>;
}

export interface QuickDialCallOutput {
  callId: string;
  executionId: string;
  leadId: string;
  status: string;
  phone: string;
}

export class QuickDialCallUseCase {
  constructor(
    private readonly bolnaClientFactory: IBolnaClientFactory,
    private readonly walletRepo: WalletRepository,
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
    const assistant = await prisma.assistant.findFirst({
      where: {
        id: input.assistantId,
        tenantId: input.tenantId,
        isDeleted: false,
      },
      include: {
        platformAgent: true,
      },
    });

    if (!assistant) {
      throw new AssistantNotFoundError();
    }

    if (!assistant.platformAgent?.bolnaId) {
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

    // 3. Create a new Lead record for this quick dial request
    const customerName = input.name ? cleanCustomerName(input.name) : null;
    const lead = await prisma.lead.create({
      data: {
        phone: normalizedPhone,
        name: customerName,
        tenantId: input.tenantId,
        assistantId: assistant.id,
        type: "OUTBOUND",
        source: "QUICK_DIAL",
        status: "PENDING",
        metadata: input.userData
          ? (input.userData as Prisma.InputJsonValue)
          : undefined,
      },
    });

    // 4. Dispatch outbound call request to Bolna
    const bolnaClient = await this.bolnaClientFactory.forTenant(input.tenantId);
    const userData: Record<string, string> = {
      ...(customerName ? { customer_name: customerName } : {}),
      ...(input.userData ?? {}),
    };

    let bolnaRes;
    try {
      bolnaRes = await bolnaClient.calls.create({
        agent_id: assistant.platformAgent.bolnaId,
        recipient_phone_number: normalizedPhone,
        user_data: userData,
      });
    } catch (err) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "FAILED" },
      });

      this.logger?.error("Failed to initiate Bolna call for quick dial", err, {
        action: "calls.quick_dial.bolna_error",
        tenantId: input.tenantId,
        leadId: lead.id,
      });
      throw err;
    }

    const executionId = bolnaRes.execution_id ?? bolnaRes.id;

    // 5. Pre-create Call record with PENDING status linked to execution ID
    const call = await prisma.call.create({
      data: {
        bolnaCallId: executionId,
        tenantId: input.tenantId,
        assistantId: assistant.id,
        leadId: lead.id,
        type: "OUTBOUND",
        source: "QUICK_DIAL",
        status: "PENDING",
      },
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
}
