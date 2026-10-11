import type { InboundNumberRepository } from "../../interfaces/inbound-number-repository.interface";
import type { InboundNumberSyncScheduler } from "../../../infrastructure/jobs/inbound-number-sync.scheduler";
import type {
  ReactivateInboundNumberDTO,
  InboundNumberDetailDTO,
} from "../../dto/inbound-number.dto";
import {
  InboundNumberNotFoundError,
  InboundNumberInvalidStateError,
} from "../../../domain/errors/inbound-number.errors";
import { InboundNumberEntity } from "../../../domain/entities/inbound-number.entity";
import { ValidationError } from "../../../../../shared/errors";
import type { Logger } from "../../../../../shared/logging/logger.interface";

export class ReactivateInboundNumberUseCase {
  constructor(
    private readonly repository: InboundNumberRepository,
    private readonly syncScheduler: InboundNumberSyncScheduler,
    private readonly logger?: Logger,
  ) {}

  async execute(dto: ReactivateInboundNumberDTO): Promise<InboundNumberDetailDTO> {
    const numberRecord = await this.repository.findById(dto.inboundNumberId);
    if (!numberRecord) {
      throw new InboundNumberNotFoundError(dto.inboundNumberId);
    }

    const entity = new InboundNumberEntity(numberRecord);
    if (!entity.canReactivate()) {
      throw new InboundNumberInvalidStateError("reactivate", entity.status);
    }

    if (!numberRecord.assistantId) {
      throw new ValidationError([
        {
          field: "assistantId",
          message:
            "Cannot reactivate inbound number without an assigned assistant.",
        },
      ]);
    }

    await this.repository.update(dto.inboundNumberId, {
      status: "ACTIVE",
      suspendedAt: null,
      providerSyncStatus: "PENDING_SYNC",
      providerSyncError: null,
    });

    await this.syncScheduler.enqueue({
      inboundNumberId: dto.inboundNumberId,
      action: "LINK",
      assistantId: numberRecord.assistantId,
    });

    this.logger?.info("Inbound number reactivated and link job enqueued", {
      action: "inbound_number.reactivated",
      inboundNumberId: dto.inboundNumberId,
    });

    const updated = await this.repository.findById(dto.inboundNumberId);
    if (!updated) {
      throw new InboundNumberNotFoundError(dto.inboundNumberId);
    }
    return updated;
  }
}
