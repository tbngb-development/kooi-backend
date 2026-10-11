import prisma from "../../../../../shared/config/database/prisma";
import type { InboundNumberRepository } from "../../interfaces/inbound-number-repository.interface";
import type { InboundNumberSyncScheduler } from "../../../infrastructure/jobs/inbound-number-sync.scheduler";
import type {
  AssignInboundNumberDTO,
  InboundNumberDetailDTO,
} from "../../dto/inbound-number.dto";
import {
  InboundNumberNotFoundError,
  InboundNumberInvalidStateError,
} from "../../../domain/errors/inbound-number.errors";
import { InboundNumberEntity } from "../../../domain/entities/inbound-number.entity";
import { NotFoundError, ValidationError } from "../../../../../shared/errors";
import type { Logger } from "../../../../../shared/logging/logger.interface";

export class AssignInboundNumberUseCase {
  constructor(
    private readonly repository: InboundNumberRepository,
    private readonly syncScheduler: InboundNumberSyncScheduler,
    private readonly logger?: Logger,
  ) {}

  async execute(dto: AssignInboundNumberDTO): Promise<InboundNumberDetailDTO> {
    const numberRecord = await this.repository.findById(dto.inboundNumberId);
    if (!numberRecord) {
      throw new InboundNumberNotFoundError(dto.inboundNumberId);
    }

    const entity = new InboundNumberEntity(numberRecord);
    if (!entity.canAssign()) {
      throw new InboundNumberInvalidStateError("assign", entity.status);
    }

    // Verify tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true, isActive: true },
    });
    if (!tenant) {
      throw new NotFoundError(`Tenant '${dto.tenantId}' was not found.`);
    }
    if (!tenant.isActive) {
      throw new ValidationError([
        {
          field: "tenantId",
          message: "Cannot assign number to an inactive tenant.",
        },
      ]);
    }

    // Verify assistant belongs to tenant
    const assistant = await prisma.assistant.findFirst({
      where: {
        id: dto.assistantId,
        tenantId: dto.tenantId,
        isDeleted: false,
      },
      include: { platformAgent: true },
    });
    if (!assistant) {
      throw new NotFoundError(
        `Assistant '${dto.assistantId}' was not found in tenant organization.`,
      );
    }
    if (!assistant.platformAgent?.bolnaId) {
      throw new ValidationError([
        {
          field: "assistantId",
          message:
            "Assistant's platform agent is missing a valid Bolna agent configuration.",
        },
      ]);
    }

    const now = new Date();
    const nextBillingAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Update repository
    await this.repository.update(dto.inboundNumberId, {
      tenantId: dto.tenantId,
      assistantId: dto.assistantId,
      status: "ACTIVE",
      providerSyncStatus: "PENDING_SYNC",
      providerSyncError: null,
      assignedAt: now,
      nextBillingAt,
      ...(dto.monthlyRentalPaisa !== undefined && {
        monthlyRentalPaisa: dto.monthlyRentalPaisa,
      }),
    });

    // Enqueue background provider link with retry
    await this.syncScheduler.enqueue({
      inboundNumberId: dto.inboundNumberId,
      action: "LINK",
      assistantId: dto.assistantId,
    });

    this.logger?.info("Inbound number assigned and sync job enqueued", {
      action: "inbound_number.assigned",
      inboundNumberId: dto.inboundNumberId,
      tenantId: dto.tenantId,
      assistantId: dto.assistantId,
    });

    const updated = await this.repository.findById(dto.inboundNumberId);
    if (!updated) {
      throw new InboundNumberNotFoundError(dto.inboundNumberId);
    }
    return updated;
  }
}
