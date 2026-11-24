import type { ISarvamApiKeyRepository } from "../interfaces/sarvam-api-key-repository.interface";
import type { ISarvamApiKeyEncryptionService } from "../interfaces/sarvam-api-key-encryption.interface";
import type { SarvamApiKeyMapper } from "../mappers/sarvam-api-key.mapper";
import type {
  UpdateSarvamApiKeyDTO,
  SarvamApiKeyResponseDTO,
} from "../dto/sarvam-api-key.dto";
import { SarvamApiKeyNotFoundError } from "../../domain/errors/sarvam-api-key.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class UpdateSarvamApiKeyUseCase {
  constructor(
    private readonly repository: ISarvamApiKeyRepository,
    private readonly encryptionService: ISarvamApiKeyEncryptionService,
    private readonly mapper: SarvamApiKeyMapper,
    private readonly logger?: Logger,
  ) {}

  async execute(
    dto: UpdateSarvamApiKeyDTO,
  ): Promise<SarvamApiKeyResponseDTO> {
    const existing = await this.repository.findById(dto.id);
    if (!existing) {
      throw new SarvamApiKeyNotFoundError(dto.id);
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

    this.logger?.info("Updated Sarvam API key", {
      action: "sarvam_api_key.updated",
      keyId: updated.id,
      tenantId: updated.tenantId,
      updatedBy: dto.updatedBy,
      keyRotated: apiKeyEncrypted !== undefined,
    });

    return this.mapper.toResponseDTO(updated);
  }
}

