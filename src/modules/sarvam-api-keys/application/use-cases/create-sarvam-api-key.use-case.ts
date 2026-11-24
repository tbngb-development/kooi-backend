import type { ISarvamApiKeyRepository } from "../interfaces/sarvam-api-key-repository.interface";
import type { ISarvamApiKeyEncryptionService } from "../interfaces/sarvam-api-key-encryption.interface";
import type { SarvamApiKeyMapper } from "../mappers/sarvam-api-key.mapper";
import type {
  CreateSarvamApiKeyDTO,
  SarvamApiKeyResponseDTO,
} from "../dto/sarvam-api-key.dto";
import {
  TenantNotFoundError,
  SarvamApiKeyConflictError,
} from "../../domain/errors/sarvam-api-key.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class CreateSarvamApiKeyUseCase {
  constructor(
    private readonly repository: ISarvamApiKeyRepository,
    private readonly encryptionService: ISarvamApiKeyEncryptionService,
    private readonly mapper: SarvamApiKeyMapper,
    private readonly logger?: Logger,
  ) {}

  async execute(
    dto: CreateSarvamApiKeyDTO,
  ): Promise<SarvamApiKeyResponseDTO> {
    const tenantExists = await this.repository.tenantExists(dto.tenantId);
    if (!tenantExists) {
      throw new TenantNotFoundError(dto.tenantId);
    }

    const alreadyConfigured = await this.repository.existsForTenant(
      dto.tenantId,
    );
    if (alreadyConfigured) {
      throw new SarvamApiKeyConflictError(dto.tenantId);
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

    this.logger?.info("Created Sarvam API key for tenant", {
      action: "sarvam_api_key.created",
      keyId: created.id,
      tenantId: created.tenantId,
      createdBy: dto.createdBy,
    });

    return this.mapper.toResponseDTO(created);
  }
}

