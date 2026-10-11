import type { InboundNumberRepository } from "../../interfaces/inbound-number-repository.interface";
import type { InboundNumberDetailDTO } from "../../dto/inbound-number.dto";
import { InboundNumberNotFoundError } from "../../../domain/errors/inbound-number.errors";
import { ForbiddenError } from "../../../../../shared/errors";

export class GetTenantInboundNumberUseCase {
  constructor(private readonly repository: InboundNumberRepository) {}

  async execute(
    tenantId: string,
    id: string,
  ): Promise<InboundNumberDetailDTO> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new InboundNumberNotFoundError(id);
    }

    if (record.tenantId !== tenantId) {
      throw new ForbiddenError(
        "You do not have permission to view this inbound number.",
      );
    }

    return record;
  }
}
