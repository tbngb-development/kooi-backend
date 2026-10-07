import { BolnaClient, type IBolnaClient } from "./bolna.client";
import type { BolnaApiKeyRepository } from "../../../../modules/bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";
import { TenantHasNoApiKeyError } from "../../../../modules/bolna-api-keys/domain/errors/bolna-api-key.errors";
import { decryptKey } from "../../../utils/encryption";
import { env } from "../../env";
import type { Logger } from "../../../logging/logger.interface";

export interface IBolnaClientFactory {
  forTenant(tenantId: string): Promise<IBolnaClient>;
  forApiKey(apiKeyId: string): Promise<IBolnaClient>;
}

export class BolnaClientFactory implements IBolnaClientFactory {
  constructor(
    private readonly apiKeyRepository: BolnaApiKeyRepository,
    private readonly logger?: Logger,
  ) {}

  async forTenant(tenantId: string): Promise<IBolnaClient> {
    const tenantKey = await this.apiKeyRepository.findKeyForTenant(tenantId);
    if (!tenantKey) throw new TenantHasNoApiKeyError(tenantId);
    if (!tenantKey.isActive) throw new TenantHasNoApiKeyError(tenantId);

    this.apiKeyRepository.updateLastAccessed(tenantKey.id).catch((err) =>
      this.logger?.error(
        "Failed to update last accessed timestamp for Bolna key",
        err,
        {
          action: "bolna.factory.update_last_accessed_failed",
          tenantId,
          keyId: tenantKey.id,
        },
      ),
    );

    const decryptedApiKey = decryptKey(tenantKey.encryptedKey);

    return new BolnaClient(
      decryptedApiKey,
      env.bolna.apiUrl,
      this.logger?.child({ module: "bolna-client", tenantId }),
    );
  }

  async forApiKey(apiKeyId: string): Promise<IBolnaClient> {
    const keyRecord = await this.apiKeyRepository.findById(apiKeyId);
    if (!keyRecord || !keyRecord.isActive) {
      throw new TenantHasNoApiKeyError(`api-key:${apiKeyId}`);
    }

    this.apiKeyRepository.updateLastAccessed(keyRecord.id).catch((err) =>
      this.logger?.error(
        "Failed to update last accessed timestamp for Bolna key",
        err,
        {
          action: "bolna.factory.update_last_accessed_failed",
          apiKeyId,
        },
      ),
    );

    const decryptedApiKey = decryptKey(keyRecord.encryptedKey);

    return new BolnaClient(
      decryptedApiKey,
      env.bolna.apiUrl,
      this.logger?.child({ module: "bolna-client", apiKeyId }),
    );
  }
}
