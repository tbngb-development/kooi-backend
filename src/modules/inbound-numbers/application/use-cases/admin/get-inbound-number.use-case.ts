import type { InboundNumberRepository } from "../../interfaces/inbound-number-repository.interface";
import type { InboundNumberDetailDTO } from "../../dto/inbound-number.dto";
import { InboundNumberNotFoundError } from "../../../domain/errors/inbound-number.errors";

export class GetInboundNumberUseCase {
  constructor(private readonly repository: InboundNumberRepository) {}

  async execute(id: string): Promise<InboundNumberDetailDTO> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new InboundNumberNotFoundError(id);
    }
    return record;
  }
}
