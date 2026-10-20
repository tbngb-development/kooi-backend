import type { IPhoneNumberRepository } from "../interfaces/phone-number-repository.interface";
import type {
  CreatePhoneNumberDto,
  PhoneNumberDetailDto,
} from "../dto/phone-number.dto";
import { validatePhoneNumberFormat } from "../../domain/rules/phone-number.rules";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../../shared/errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class CreatePhoneNumberUseCase {
  constructor(
    private readonly repo: IPhoneNumberRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(dto: CreatePhoneNumberDto): Promise<PhoneNumberDetailDto> {
    const { valid, normalized, error } = validatePhoneNumberFormat(
      dto.phoneNumber,
    );
    if (!valid) {
      throw new ValidationError([
        {
          field: "phoneNumber",
          message: error || "Invalid phone number format",
        },
      ]);
    }

    const existing = await this.repo.findByPhoneNumber(normalized);
    if (existing) {
      throw new ConflictError(
        `Phone number "${normalized}" is already registered in the system`,
      );
    }

    if (dto.tenantId) {
      const tenantExists = await this.repo.checkTenantExists(dto.tenantId);
      if (!tenantExists) {
        throw new NotFoundError(`Tenant "${dto.tenantId}" not found`);
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
    }

    const created = await this.repo.create({
      ...dto,
      normalizedPhone: normalized,
    });

    this.logger?.info("Registered new phone number into inventory", {
      action: "phone_number.create",
      id: created.id,
      phoneNumber: created.phoneNumber,
      tenantId: created.tenantId ?? undefined,
      provider: created.provider,
    });

    return created;
  }
}
