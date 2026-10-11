import prisma from "../../../../shared/config/database/prisma";
import { assertTenantNotFrozen } from "../../../../shared/utils/tenant-freeze.guard";
import { normalizePhoneNumber } from "../../../leads/domain/rules/phone.rules";
import type { BolnaCallProvider } from "../../../calls/application/interfaces/bolna-call-provider.interface";
import type { QuickDialRepository } from "../interfaces/quick-dial-repository.interface";
import type {
  InitiateQuickDialDTO,
  QuickDialJobDTO,
} from "../dto/quick-dial.dto";
import {
  InsufficientCreditsForQuickDialError,
  QuickDialAssistantNotFoundError,
  QuickDialExecutionError,
} from "../../domain/errors/quick-dial.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { BolnaCallPayload } from "../../../../shared/types/bolna.types";

export class InitiateQuickDialUseCase {
  constructor(
    private readonly repository: QuickDialRepository,
    private readonly bolnaCallProvider: BolnaCallProvider,
    private readonly logger?: Logger,
  ) {}

  async execute(dto: InitiateQuickDialDTO): Promise<QuickDialJobDTO> {
    // 1. Workspace Migration Freeze Guard
    await assertTenantNotFrozen(dto.tenantId);

    // 2. Wallet Balance Guard
    const wallet = await prisma.wallet.findUnique({
      where: { tenantId: dto.tenantId },
      select: { cashBalance: true, bonusBalance: true },
    });

    const totalBalance = (wallet?.cashBalance ?? 0) + (wallet?.bonusBalance ?? 0);
    if (!wallet || totalBalance <= 0) {
      throw new InsufficientCreditsForQuickDialError();
    }

    // 3. Resolve Assistant
    const assistant = await prisma.assistant.findFirst({
      where: {
        id: dto.assistantId,
        tenantId: dto.tenantId,
        isDeleted: false,
      },
      include: { platformAgent: true },
    });

    if (!assistant || !assistant.platformAgent?.bolnaId) {
      throw new QuickDialAssistantNotFoundError(dto.assistantId);
    }

    // 4. Normalize Recipient Phone
    const normalizedPhone = normalizePhoneNumber(dto.recipientPhone);

    // 5. Resolve or auto-provision Lead
    let leadId = dto.leadId ?? null;
    let leadName = "";

    if (leadId) {
      const existing = await prisma.lead.findFirst({
        where: { id: leadId, tenantId: dto.tenantId, isDeleted: false },
        select: { id: true, name: true },
      });
      if (existing) {
        leadName = existing.name ?? "";
      } else {
        leadId = null;
      }
    }

    if (!leadId) {
      const digits = normalizedPhone.replace(/\D/g, "");
      const last10 = digits.slice(-10);
      const candidatePhones = Array.from(
        new Set([normalizedPhone, `+91${last10}`, `91${last10}`, last10]),
      ).filter(Boolean);

      const existingLead = await prisma.lead.findFirst({
        where: {
          tenantId: dto.tenantId,
          phone: { in: candidatePhones },
          isDeleted: false,
        },
        select: { id: true, name: true },
      });

      if (existingLead) {
        leadId = existingLead.id;
        leadName = existingLead.name ?? "";
      } else {
        const created = await prisma.lead.create({
          data: {
            tenantId: dto.tenantId,
            phone: normalizedPhone,
            name: "Quick Dial Contact",
            status: "CALLING",
          },
          select: { id: true, name: true },
        });
        leadId = created.id;
        leadName = created.name ?? "";
      }
    }

    // 6. Create Quick Dial Job record with PENDING status
    const job = await this.repository.createJob({
      tenantId: dto.tenantId,
      userId: dto.userId,
      assistantId: dto.assistantId,
      leadId,
      recipientPhone: normalizedPhone,
      status: "PENDING",
      metadata: dto.metadata ?? null,
    });

    // 7. Trigger Bolna Outbound Call
    const assistantConfig = (assistant.config ?? {}) as Record<string, string>;
    const bolnaPayload: BolnaCallPayload = {
      agent_id: assistant.platformAgent.bolnaId,
      recipient_phone_number: normalizedPhone,
      ...(dto.fromPhoneNumber && { from_phone_number: dto.fromPhoneNumber }),
      user_data: {
        customer_name: leadName,
        contact_number: normalizedPhone,
        ...assistantConfig,
        ...(dto.userData ?? {}),
      },
    };

    try {
      const bolnaResponse = await this.bolnaCallProvider.createCall(
        dto.tenantId,
        bolnaPayload,
      );

      // Create Call record
      await this.repository.createCallForJob({
        bolnaCallId: bolnaResponse.id,
        tenantId: dto.tenantId,
        assistantId: assistant.id,
        leadId,
        quickDialJobId: job.id,
      });

      // Transition Quick Dial Job to INITIATED
      await this.repository.updateJob(job.id, {
        status: "INITIATED",
        bolnaExecutionId: bolnaResponse.id,
      });

      this.logger?.info("Quick dial call initiated successfully", {
        action: "quick_dial.initiated",
        jobId: job.id,
        tenantId: dto.tenantId,
        bolnaExecutionId: bolnaResponse.id,
        recipientPhone: normalizedPhone,
      });

      const updatedJob = await this.repository.findById(dto.tenantId, job.id);
      if (!updatedJob) {
        throw new QuickDialExecutionError(
          "Failed to retrieve created quick dial job",
        );
      }
      return updatedJob;
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to dispatch call to voice provider";

      await this.repository.updateJob(job.id, {
        status: "FAILED",
        error: errorMessage,
      });

      this.logger?.error("Failed to initiate quick dial call", err, {
        action: "quick_dial.initiate_failed",
        jobId: job.id,
        tenantId: dto.tenantId,
        recipientPhone: normalizedPhone,
      });

      throw new QuickDialExecutionError(errorMessage);
    }
  }
}
