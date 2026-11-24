import type { ISarvamApiKeyRepository } from "../interfaces/sarvam-api-key-repository.interface";
import type { ISarvamApiKeyEncryptionService } from "../interfaces/sarvam-api-key-encryption.interface";
import type { SarvamApiKeyInternalDTO } from "../dto/sarvam-api-key.dto";
import {
  SarvamApiKeyNotFoundError,
  SarvamApiKeyInactiveError,
} from "../../domain/errors/sarvam-api-key.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export interface ISarvamApiKeyService {
  getSarvamApiKey(tenantId: string): Promise<SarvamApiKeyInternalDTO>;
  getSarvamCredentials(tenantId: string): Promise<SarvamApiKeyInternalDTO>;
}

export class SarvamApiKeyService implements ISarvamApiKeyService {
  constructor(
    private readonly repository: ISarvamApiKeyRepository,
    private readonly encryptionService: ISarvamApiKeyEncryptionService,
    private readonly logger?: Logger,
  ) {}

  async getSarvamApiKey(tenantId: string): Promise<SarvamApiKeyInternalDTO> {
    if (
      !tenantId ||
      typeof tenantId !== "string" ||
      tenantId.trim().length === 0
    ) {
      throw new SarvamApiKeyNotFoundError(tenantId);
    }

    const record = await this.repository.findByTenantId(tenantId.trim());
    if (!record) {
      throw new SarvamApiKeyNotFoundError(tenantId);
    }

    if (!record.isActive) {
      throw new SarvamApiKeyInactiveError(tenantId);
    }

    const apiKey = this.encryptionService.decrypt(record.apiKeyEncrypted);

    this.logger?.debug("Retrieved internal Sarvam API key for tenant", {
      action: "sarvam_api_key.retrieved",
      tenantId,
      keyId: record.id,
    });

    return {
      tenantId: record.tenantId,
      apiKey,
      workspaceId: record.workspaceId,
      organizationId: record.organizationId,
      isActive: record.isActive,
    };
  }

  // Backward-compatible alias
  async getSarvamCredentials(
    tenantId: string,
  ): Promise<SarvamApiKeyInternalDTO> {
    return this.getSarvamApiKey(tenantId);
  }
}

