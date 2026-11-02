import type { SarvamConfigurationWithTenant } from "../interfaces/sarvam-configuration-repository.interface";
import type { ISarvamEncryptionService } from "../interfaces/sarvam-encryption-service.interface";
import type { SarvamConfigurationResponseDTO } from "../dto/sarvam-configuration.dto";

export class SarvamConfigurationMapper {
  constructor(private readonly encryptionService: ISarvamEncryptionService) {}

  toResponseDTO(
    entity: SarvamConfigurationWithTenant,
  ): SarvamConfigurationResponseDTO {
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

