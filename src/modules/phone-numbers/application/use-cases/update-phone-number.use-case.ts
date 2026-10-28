import type { IPhoneNumberRepository } from "../interfaces/phone-number-repository.interface";
import type {
  UpdatePhoneNumberDto,
  PhoneNumberDetailDto,
} from "../dto/phone-number.dto";
import { NotFoundError } from "../../../../shared/errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class UpdatePhoneNumberUseCase {
  constructor(
    private readonly repo: IPhoneNumberRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(
    id: string,
    dto: UpdatePhoneNumberDto,
  ): Promise<PhoneNumberDetailDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Phone number with ID "${id}" not found`);
    }

    const updated = await this.repo.update(id, dto);

    this.logger?.info("Updated phone number settings", {
      action: "phone_number.update",
      id,
      status: updated.status,
      capabilities: updated.capabilities,
      provider: updated.provider,
    });

    return updated;
  }
}
