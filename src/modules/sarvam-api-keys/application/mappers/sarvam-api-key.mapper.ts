import type { SarvamApiKeyWithTenant } from "../interfaces/sarvam-api-key-repository.interface";
import type { ISarvamApiKeyEncryptionService } from "../interfaces/sarvam-api-key-encryption.interface";
import type { SarvamApiKeyResponseDTO } from "../dto/sarvam-api-key.dto";

export class SarvamApiKeyMapper {
  constructor(
    private readonly encryptionService: ISarvamApiKeyEncryptionService,
  ) {}

  toResponseDTO(entity: SarvamApiKeyWithTenant): SarvamApiKeyResponseDTO {
    let maskedApiKey = "••••••••";
    try {
      const decrypted = this.encryptionService.decrypt(entity.apiKeyEncrypted);
      maskedApiKey = this.encryptionService.maskKey(decrypted);
    } catch {
      maskedApiKey = "••••••••[encrypted]";
    }

    return {
      id: entity.id,
      tenantId: entity.tenantId,
      tenantName: entity.tenant.name,
      tenantEmail: entity.tenant.email,
      workspaceId: entity.workspaceId,
      organizationId: entity.organizationId,
      maskedApiKey,
      isActive: entity.isActive,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      createdBy: entity.createdBy,
      updatedBy: entity.updatedBy,
    };
  }
}

