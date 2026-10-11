import prisma from "../../../../../shared/config/database/prisma";
import { normalizePhoneNumber } from "../../../../leads/domain/rules/phone.rules";
import type { InboundNumberRepository } from "../../interfaces/inbound-number-repository.interface";
import type {
  CreateCustomInboundNumberDTO,
  InboundNumberListItemDTO,
} from "../../dto/inbound-number.dto";
import { ValidationError } from "../../../../../shared/errors";
import type { Logger } from "../../../../../shared/logging/logger.interface";
import { randomUUID } from "node:crypto";

export class CreateCustomInboundNumberUseCase {
  constructor(
    private readonly repository: InboundNumberRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(dto: CreateCustomInboundNumberDTO): Promise<InboundNumberListItemDTO> {
    const normalized = normalizePhoneNumber(dto.phoneNumber);

    const existing = await this.repository.findByPhoneNumber(normalized);
    if (existing) {
      throw new ValidationError([
        {
          field: "phoneNumber",
          message: `Phone number '${normalized}' is already registered in the system.`,
        },
      ]);
    }

    const providerName = (dto.provider || "custom").toLowerCase().trim();
    const bolnaPhoneNumberId =
      dto.providerNumberId?.trim() || `custom_${providerName}_${randomUUID().replace(/-/g, "")}`;

    this.logger?.info("Creating custom telephony inbound number", {
      action: "inbound_numbers.create_custom",
      phoneNumber: normalized,
      provider: providerName,
      monthlyRentalPaisa: dto.monthlyRentalPaisa ?? 0,
    });

    const created = await this.repository.create({
      phoneNumber: normalized,
      bolnaPhoneNumberId,
      provider: providerName,
      monthlyRentalPaisa: dto.monthlyRentalPaisa ?? 0,
    });

    return created;
  }
}
