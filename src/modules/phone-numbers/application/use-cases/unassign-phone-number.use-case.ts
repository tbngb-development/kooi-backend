import type { IPhoneNumberRepository } from "../interfaces/phone-number-repository.interface";
import type { PhoneNumberDetailDto } from "../dto/phone-number.dto";
import { NotFoundError } from "../../../../shared/errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class UnassignPhoneNumberUseCase {
  constructor(
    private readonly repo: IPhoneNumberRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(id: string): Promise<PhoneNumberDetailDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Phone number with ID "${id}" not found`);
    }

    const updated = await this.repo.unassign(id);

    this.logger?.info("Unassigned phone number from tenant", {
      action: "phone_number.unassign",
      id,
      phoneNumber: updated.phoneNumber,
    });

    return updated;
  }
}
