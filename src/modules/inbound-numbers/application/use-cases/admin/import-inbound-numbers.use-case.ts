import prisma from "../../../../../shared/config/database/prisma";
import { normalizePhoneNumber } from "../../../../leads/domain/rules/phone.rules";
import type { InboundNumberRepository } from "../../interfaces/inbound-number-repository.interface";
import type { IBolnaClientFactory } from "../../../../../shared/config/external/bolna/bolna-client.factory";
import type {
  ImportInboundNumbersDTO,
  ImportInboundNumbersResult,
} from "../../dto/inbound-number.dto";
import type { Logger } from "../../../../../shared/logging/logger.interface";

export class ImportInboundNumbersUseCase {
  constructor(
    private readonly repository: InboundNumberRepository,
    private readonly bolnaFactory: IBolnaClientFactory,
    private readonly logger?: Logger,
  ) {}

  async execute(dto: ImportInboundNumbersDTO): Promise<ImportInboundNumbersResult> {
    let apiKeyId = dto.bolnaApiKeyId;

    if (!apiKeyId) {
      const defaultKey = await prisma.bolnaApiKey.findFirst({
        where: { isPlatformDefault: true, isActive: true },
        select: { id: true },
      });
      if (!defaultKey) {
        throw new Error("No active platform default Bolna API key found.");
      }
      apiKeyId = defaultKey.id;
    }

    this.logger?.info("Importing inbound phone numbers from Bolna", {
      action: "inbound_numbers.import.start",
      apiKeyId,
    });

    const bolnaClient = await this.bolnaFactory.forApiKey(apiKeyId);
    const discovered = await bolnaClient.phoneNumbers.list();

    let importedCount = 0;
    let skippedCount = 0;
    const resultNumbers = [];

    for (const item of discovered) {
      if (!item.phone_number || !item.id) continue;

      const normalized = normalizePhoneNumber(item.phone_number);

      const existing =
        (await this.repository.findByBolnaPhoneNumberId(item.id)) ??
        (await this.repository.findByPhoneNumber(normalized));

      if (existing) {
        skippedCount++;
        resultNumbers.push({
          phoneNumber: existing.phoneNumber,
          bolnaPhoneNumberId: existing.bolnaPhoneNumberId,
          status: existing.status,
        });
        continue;
      }

      const created = await this.repository.create({
        phoneNumber: normalized,
        bolnaPhoneNumberId: item.id,
        provider: "bolna",
        bolnaApiKeyId: apiKeyId,
        monthlyRentalPaisa: 0,
      });

      importedCount++;
      resultNumbers.push({
        phoneNumber: created.phoneNumber,
        bolnaPhoneNumberId: created.bolnaPhoneNumberId,
        status: created.status,
      });
    }

    this.logger?.info("Inbound numbers imported successfully", {
      action: "inbound_numbers.import.success",
      totalFound: discovered.length,
      importedCount,
      skippedCount,
    });

    return {
      totalFound: discovered.length,
      importedCount,
      skippedCount,
      numbers: resultNumbers,
    };
  }
}
