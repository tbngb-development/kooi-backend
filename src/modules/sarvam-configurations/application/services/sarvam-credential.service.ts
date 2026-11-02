import type { ISarvamConfigurationRepository } from "../interfaces/sarvam-configuration-repository.interface";
import type { ISarvamEncryptionService } from "../interfaces/sarvam-encryption-service.interface";
import type { SarvamCredentialsInternalDTO } from "../dto/sarvam-configuration.dto";
import {
  SarvamConfigurationNotFoundError,
  SarvamConfigurationInactiveError,
} from "../../domain/errors/sarvam-configuration.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface ISarvamCredentialService {
  getSarvamCredentials(tenantId: string): Promise<SarvamCredentialsInternalDTO>;
}

export class SarvamCredentialService implements ISarvamCredentialService {
  constructor(
    private readonly repository: ISarvamConfigurationRepository,
    private readonly encryptionService: ISarvamEncryptionService,
    private readonly logger?: Logger,
  ) {}

  async getSarvamCredentials(
    tenantId: string,
  ): Promise<SarvamCredentialsInternalDTO> {
    if (!tenantId || typeof tenantId !== "string" || tenantId.trim().length === 0) {
      throw new SarvamConfigurationNotFoundError(tenantId);
    }

    const config = await this.repository.findByTenantId(tenantId.trim());
    if (!config) {
      throw new SarvamConfigurationNotFoundError(tenantId);
    }

    if (!config.isActive) {
      throw new SarvamConfigurationInactiveError(tenantId);
    }

    const apiKey = this.encryptionService.decrypt(config.apiKeyEncrypted);

    this.logger?.debug("Retrieved internal Sarvam credentials for tenant", {
      action: "sarvam_credentials.retrieved",
      tenantId,
      configurationId: config.id,
    });

    return {
      tenantId: config.tenantId,
      apiKey,
      workspaceId: config.workspaceId,
      organizationId: config.organizationId,
      isActive: config.isActive,
    };
  }
}

