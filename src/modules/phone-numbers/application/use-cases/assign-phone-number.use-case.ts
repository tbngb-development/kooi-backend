import type { IPhoneNumberRepository } from "../interfaces/phone-number-repository.interface";
import type {
  AssignPhoneNumberDto,
  PhoneNumberDetailDto,
} from "../dto/phone-number.dto";
import { NotFoundError, ValidationError } from "../../../../shared/errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class AssignPhoneNumberUseCase {
  constructor(
    private readonly repo: IPhoneNumberRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(
    id: string,
    dto: AssignPhoneNumberDto,
  ): Promise<PhoneNumberDetailDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Phone number with ID "${id}" not found`);
    }

    const tenantExists = await this.repo.checkTenantExists(dto.tenantId);
    if (!tenantExists) {
      throw new NotFoundError(`Tenant with ID "${dto.tenantId}" not found`);
    }

    if (dto.assistantId) {
      const assistantValid = await this.repo.checkAssistantBelongsToTenant(
        dto.assistantId,
        dto.tenantId,
      );
      if (!assistantValid) {
        throw new ValidationError([
          {
            field: "assistantId",
            message: `Assistant "${dto.assistantId}" does not belong to tenant "${dto.tenantId}" or is deleted`,
          },
        ]);
      }
    }

    const updated = await this.repo.assign(id, dto);

    this.logger?.info("Assigned phone number to tenant", {
      action: "phone_number.assign",
      id,
      phoneNumber: updated.phoneNumber,
      tenantId: dto.tenantId,
      assistantId: dto.assistantId,
    });

    return updated;
  }
}
