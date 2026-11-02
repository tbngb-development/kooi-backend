import type { ISarvamConfigurationRepository } from "../interfaces/sarvam-configuration-repository.interface";
import type { ISarvamEncryptionService } from "../interfaces/sarvam-encryption-service.interface";
import type { SarvamConfigurationMapper } from "../mappers/sarvam-configuration.mapper";
import type {
  CreateSarvamConfigurationDTO,
  SarvamConfigurationResponseDTO,
} from "../dto/sarvam-configuration.dto";
import {
  TenantNotFoundError,
  SarvamConfigurationConflictError,
} from "../../domain/errors/sarvam-configuration.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class CreateSarvamConfigurationUseCase {
  constructor(
    private readonly repository: ISarvamConfigurationRepository,
    private readonly encryptionService: ISarvamEncryptionService,
    private readonly mapper: SarvamConfigurationMapper,
    private readonly logger?: Logger,
  ) {}

  async execute(
    dto: CreateSarvamConfigurationDTO,
  ): Promise<SarvamConfigurationResponseDTO> {
    const tenantExists = await this.repository.tenantExists(dto.tenantId);
    if (!tenantExists) {
      throw new TenantNotFoundError(dto.tenantId);
    }

    const alreadyConfigured = await this.repository.existsForTenant(dto.tenantId);
    if (alreadyConfigured) {
      throw new SarvamConfigurationConflictError(dto.tenantId);
    }

    const apiKeyEncrypted = this.encryptionService.encrypt(dto.apiKey.trim());

    const created = await this.repository.create({
      tenantId: dto.tenantId,
      apiKeyEncrypted,
      workspaceId: dto.workspaceId.trim(),
      organizationId: dto.organizationId.trim(),
      isActive: dto.isActive ?? true,
      createdBy: dto.createdBy,
    });

    this.logger?.info("Created Sarvam configuration for tenant", {
      action: "sarvam_configuration.created",
      configurationId: created.id,
      tenantId: created.tenantId,
      createdBy: dto.createdBy,
    });

    return this.mapper.toResponseDTO(created);
  }
}

