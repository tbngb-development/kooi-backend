import type { ISarvamConfigurationRepository } from "../interfaces/sarvam-configuration-repository.interface";
import type { ISarvamEncryptionService } from "../interfaces/sarvam-encryption-service.interface";
import type { SarvamConfigurationMapper } from "../mappers/sarvam-configuration.mapper";
import type {
  UpdateSarvamConfigurationDTO,
  SarvamConfigurationResponseDTO,
} from "../dto/sarvam-configuration.dto";
import { SarvamConfigurationNotFoundError } from "../../domain/errors/sarvam-configuration.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class UpdateSarvamConfigurationUseCase {
  constructor(
    private readonly repository: ISarvamConfigurationRepository,
    private readonly encryptionService: ISarvamEncryptionService,
    private readonly mapper: SarvamConfigurationMapper,
    private readonly logger?: Logger,
  ) {}

  async execute(
    dto: UpdateSarvamConfigurationDTO,
  ): Promise<SarvamConfigurationResponseDTO> {
    const existing = await this.repository.findById(dto.id);
    if (!existing) {
      throw new SarvamConfigurationNotFoundError(dto.id);
    }

    let apiKeyEncrypted: string | undefined;
    if (dto.apiKey !== undefined && dto.apiKey.trim().length > 0) {
      apiKeyEncrypted = this.encryptionService.encrypt(dto.apiKey.trim());
    }

    const updated = await this.repository.update(dto.id, {
      ...(apiKeyEncrypted !== undefined && { apiKeyEncrypted }),
      ...(dto.workspaceId !== undefined && {
        workspaceId: dto.workspaceId.trim(),
      }),
      ...(dto.organizationId !== undefined && {
        organizationId: dto.organizationId.trim(),
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      updatedBy: dto.updatedBy,
    });

    this.logger?.info("Updated Sarvam configuration", {
      action: "sarvam_configuration.updated",
      configurationId: updated.id,
      tenantId: updated.tenantId,
      updatedBy: dto.updatedBy,
      keyRotated: apiKeyEncrypted !== undefined,
    });

    return this.mapper.toResponseDTO(updated);
  }
}

