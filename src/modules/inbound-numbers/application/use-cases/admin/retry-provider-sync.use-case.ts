import type { InboundNumberRepository } from "../../interfaces/inbound-number-repository.interface";
import type { InboundNumberSyncScheduler } from "../../../infrastructure/jobs/inbound-number-sync.scheduler";
import type {
  RetryProviderSyncDTO,
  InboundNumberDetailDTO,
} from "../../dto/inbound-number.dto";
import { InboundNumberNotFoundError } from "../../../domain/errors/inbound-number.errors";
import type { Logger } from "../../../../../shared/logging/logger.interface";

export class RetryProviderSyncUseCase {
  constructor(
    private readonly repository: InboundNumberRepository,
    private readonly syncScheduler: InboundNumberSyncScheduler,
    private readonly logger?: Logger,
  ) {}

  async execute(dto: RetryProviderSyncDTO): Promise<InboundNumberDetailDTO> {
    const numberRecord = await this.repository.findById(dto.inboundNumberId);
    if (!numberRecord) {
      throw new InboundNumberNotFoundError(dto.inboundNumberId);
    }

    const action = numberRecord.status === "ACTIVE" ? "LINK" : "UNLINK";

    await this.repository.update(dto.inboundNumberId, {
      providerSyncStatus: "PENDING_SYNC",
      providerSyncError: null,
    });

    await this.syncScheduler.enqueue({
      inboundNumberId: dto.inboundNumberId,
      action,
      assistantId: numberRecord.assistantId ?? undefined,
    });

    this.logger?.info("Provider sync retried manually for inbound number", {
      action: "inbound_number.retry_sync",
      inboundNumberId: dto.inboundNumberId,
      syncAction: action,
    });

    const updated = await this.repository.findById(dto.inboundNumberId);
    if (!updated) {
      throw new InboundNumberNotFoundError(dto.inboundNumberId);
    }
    return updated;
  }
}
