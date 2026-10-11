import type { InboundNumberRepository } from "../../interfaces/inbound-number-repository.interface";
import type { InboundNumberSyncScheduler } from "../../../infrastructure/jobs/inbound-number-sync.scheduler";
import type {
  ReleaseInboundNumberDTO,
  InboundNumberDetailDTO,
} from "../../dto/inbound-number.dto";
import {
  InboundNumberNotFoundError,
  InboundNumberInvalidStateError,
} from "../../../domain/errors/inbound-number.errors";
import { InboundNumberEntity } from "../../../domain/entities/inbound-number.entity";
import type { Logger } from "../../../../../shared/logging/logger.interface";

export class ReleaseInboundNumberUseCase {
  constructor(
    private readonly repository: InboundNumberRepository,
    private readonly syncScheduler: InboundNumberSyncScheduler,
    private readonly logger?: Logger,
  ) {}

  async execute(dto: ReleaseInboundNumberDTO): Promise<InboundNumberDetailDTO> {
    const numberRecord = await this.repository.findById(dto.inboundNumberId);
    if (!numberRecord) {
      throw new InboundNumberNotFoundError(dto.inboundNumberId);
    }

    const entity = new InboundNumberEntity(numberRecord);
    if (!entity.canRelease()) {
      throw new InboundNumberInvalidStateError("release", entity.status);
    }

    await this.repository.update(dto.inboundNumberId, {
      status: "AVAILABLE",
      tenantId: null,
      assistantId: null,
      assignedAt: null,
      suspendedAt: null,
      nextBillingAt: null,
      providerSyncStatus: "PENDING_SYNC",
      providerSyncError: null,
    });

    await this.syncScheduler.enqueue({
      inboundNumberId: dto.inboundNumberId,
      action: "UNLINK",
    });

    this.logger?.info("Inbound number released to inventory and unlink job enqueued", {
      action: "inbound_number.released",
      inboundNumberId: dto.inboundNumberId,
    });

    const updated = await this.repository.findById(dto.inboundNumberId);
    if (!updated) {
      throw new InboundNumberNotFoundError(dto.inboundNumberId);
    }
    return updated;
  }
}
