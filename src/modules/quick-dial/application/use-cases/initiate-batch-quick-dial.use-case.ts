import prisma from "../../../../shared/config/database/prisma";
import { assertTenantNotFrozen } from "../../../../shared/utils/tenant-freeze.guard";
import { normalizePhoneNumber } from "../../../leads/domain/rules/phone.rules";
import type { BolnaCallProvider } from "../../../calls/application/interfaces/bolna-call-provider.interface";
import type { QuickDialRepository } from "../interfaces/quick-dial-repository.interface";
import type {
  InitiateBatchQuickDialDTO,
  BatchQuickDialResultDTO,
  BatchQuickDialContactResult,
  QuickDialBatchContactInput,
} from "../dto/quick-dial.dto";
import {
  InsufficientCreditsForQuickDialError,
  QuickDialAssistantNotFoundError,
} from "../../domain/errors/quick-dial.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";
import type { BolnaCallPayload } from "../../../../shared/types/bolna.types";

const MAX_DISPATCH_CONCURRENCY = 4;

export class InitiateBatchQuickDialUseCase {
  constructor(
    private readonly repository: QuickDialRepository,
    private readonly bolnaCallProvider: BolnaCallProvider,
    private readonly logger?: Logger,
  ) {}

  async execute(
    dto: InitiateBatchQuickDialDTO,
  ): Promise<BatchQuickDialResultDTO> {
    // 1. Tenant Freeze Guard
    await assertTenantNotFrozen(dto.tenantId);

    // 2. Wallet Balance Guard
    const wallet = await prisma.wallet.findUnique({
      where: { tenantId: dto.tenantId },
      select: { cashBalance: true, bonusBalance: true },
    });

    const totalBalance =
      (wallet?.cashBalance ?? 0) + (wallet?.bonusBalance ?? 0);
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

    const assistantConfig = (assistant.config ?? {}) as Record<string, string>;

    // 4. Validate and pre-process contacts
    const seenPhones = new Set<string>();
    const processItems: {
      input: QuickDialBatchContactInput;
      normalizedPhone: string;
      preError?: string;
    }[] = [];

    for (const contact of dto.contacts) {
      let normalized = "";
      try {
        normalized = normalizePhoneNumber(contact.recipientPhone);
      } catch {
        // ignore normalization throw
      }

      const digits = (normalized || contact.recipientPhone).replace(/\D/g, "");
      if (digits.length < 10) {
        processItems.push({
          input: contact,
          normalizedPhone: normalized || contact.recipientPhone,
          preError: "Invalid phone number: minimum 10 digits required",
        });
        continue;
      }

      if (seenPhones.has(normalized)) {
        processItems.push({
          input: contact,
          normalizedPhone: normalized,
          preError: "Duplicate phone number in current batch",
        });
        continue;
      }

      seenPhones.add(normalized);
      processItems.push({
        input: contact,
        normalizedPhone: normalized,
      });
    }

    // 5. Worker for dispatching a single contact
    const dispatchContact = async (item: {
      input: QuickDialBatchContactInput;
      normalizedPhone: string;
      preError?: string;
    }): Promise<BatchQuickDialContactResult> => {
      const { input, normalizedPhone, preError } = item;

      if (preError) {
        return {
          recipientPhone: input.recipientPhone,
          normalizedPhone,
          customerName: input.customerName,
          leadId: input.leadId,
          success: false,
          error: preError,
        };
      }

      // Resolve or auto-create Lead
      let leadId = input.leadId ?? null;
      let leadName = input.customerName ?? "";

      try {
        if (leadId) {
          const existing = await prisma.lead.findFirst({
            where: { id: leadId, tenantId: dto.tenantId, isDeleted: false },
            select: { id: true, name: true },
          });
          if (existing) {
            leadName = existing.name || leadName;
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
            leadName = existingLead.name || leadName;
          } else {
            const created = await prisma.lead.create({
              data: {
                tenantId: dto.tenantId,
                phone: normalizedPhone,
                name: leadName || "Quick Dial Contact",
                status: "CALLING",
              },
              select: { id: true, name: true },
            });
            leadId = created.id;
            leadName = created.name ?? leadName;
          }
        }

        // Create Quick Dial Job with PENDING status
        const job = await this.repository.createJob({
          tenantId: dto.tenantId,
          userId: dto.userId,
          assistantId: dto.assistantId,
          leadId,
          recipientPhone: normalizedPhone,
          status: "PENDING",
          metadata: input.metadata ?? null,
        });

        // Trigger Bolna call
        const bolnaPayload: BolnaCallPayload = {
          agent_id: assistant.platformAgent.bolnaId,
          recipient_phone_number: normalizedPhone,
          ...(dto.fromPhoneNumber && {
            from_phone_number: dto.fromPhoneNumber,
          }),
          user_data: {
            customer_name: leadName,
            contact_number: normalizedPhone,
            ...assistantConfig,
            ...(input.userData ?? {}),
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

          // Transition Job to INITIATED
          await this.repository.updateJob(job.id, {
            status: "INITIATED",
            bolnaExecutionId: bolnaResponse.id,
          });

          return {
            recipientPhone: input.recipientPhone,
            normalizedPhone,
            leadId,
            customerName: leadName,
            success: true,
            jobId: job.id,
            bolnaExecutionId: bolnaResponse.id,
          };
        } catch (callErr: unknown) {
          const errorMessage =
            callErr instanceof Error
              ? callErr.message
              : "Failed to dispatch call to voice provider";

          await this.repository.updateJob(job.id, {
            status: "FAILED",
            error: errorMessage,
          });

          return {
            recipientPhone: input.recipientPhone,
            normalizedPhone,
            leadId,
            customerName: leadName,
            success: false,
            jobId: job.id,
            error: errorMessage,
          };
        }
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : "Unexpected error preparing quick dial";

        return {
          recipientPhone: input.recipientPhone,
          normalizedPhone,
          customerName: leadName,
          leadId,
          success: false,
          error: errorMsg,
        };
      }
    };

    // 6. Execute bounded concurrency
    const results: BatchQuickDialContactResult[] = new Array(
      processItems.length,
    );
    let currentIndex = 0;
    const workerCount = Math.min(MAX_DISPATCH_CONCURRENCY, processItems.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (currentIndex < processItems.length) {
        const index = currentIndex++;
        results[index] = await dispatchContact(processItems[index]);
      }
    });

    await Promise.all(workers);

    const initiatedCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    this.logger?.info("Batch quick dial execution completed", {
      action: "quick_dial.batch_completed",
      tenantId: dto.tenantId,
      totalRequested: dto.contacts.length,
      initiatedCount,
      failedCount,
    });

    return {
      totalRequested: dto.contacts.length,
      initiatedCount,
      failedCount,
      results,
    };
  }
}
