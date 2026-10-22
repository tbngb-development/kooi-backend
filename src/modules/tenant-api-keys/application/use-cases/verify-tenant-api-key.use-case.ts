import type { ITenantApiKeyRepository } from "../interfaces/tenant-api-key-repository.interface";
import type { IApiKeyCryptoService } from "../../infrastructure/services/api-key-crypto.service";
import type { TenantApiKeyEntity } from "../../domain/entities/tenant-api-key.entity";
import { UnauthorizedError } from "../../../../shared/errors/unauthorized.error";
import { ForbiddenError } from "../../../../shared/errors/forbidden.error";
import { ApiKeyMessages, AuthMessages } from "../../../../shared/constants/messages";
import type { Logger } from "../../../../shared/logging/logger.interface";

const THROTTLE_UPDATE_MS = 60 * 1000; // 60 seconds

export class VerifyTenantApiKeyUseCase {
  constructor(
    private readonly repository: ITenantApiKeyRepository,
    private readonly cryptoService: IApiKeyCryptoService,
    private readonly logger?: Logger,
  ) {}

  async execute(rawKey: string): Promise<TenantApiKeyEntity> {
    if (!rawKey || typeof rawKey !== "string") {
      throw new UnauthorizedError(ApiKeyMessages.INVALID_KEY);
    }

    const dotIndex = rawKey.indexOf(".");
    if (dotIndex === -1) {
      throw new UnauthorizedError(ApiKeyMessages.INVALID_KEY);
    }

    const keyIdentifier = rawKey.slice(0, dotIndex);
    const secret = rawKey.slice(dotIndex + 1);

    if (!keyIdentifier.startsWith("ki-") || !secret) {
      throw new UnauthorizedError(ApiKeyMessages.INVALID_KEY);
    }

    const keyRecord = await this.repository.findByKeyIdentifier(keyIdentifier);
    if (!keyRecord) {
      this.logger?.warn("API key lookup failed - unknown identifier", {
        action: "tenant_api_key.verify_failed",
        keyIdentifier,
      });
      throw new UnauthorizedError(ApiKeyMessages.INVALID_KEY);
    }

    const isValidSecret = this.cryptoService.verifySecret(
      secret,
      keyRecord.secretHash,
    );

    if (!isValidSecret) {
      this.logger?.warn("API key verification failed - invalid secret", {
        action: "tenant_api_key.verify_failed",
        keyIdentifier,
        tenantId: keyRecord.tenantId,
      });
      throw new UnauthorizedError(ApiKeyMessages.INVALID_KEY);
    }

    if (keyRecord.tenant && !keyRecord.tenant.isActive) {
      this.logger?.warn("API key access denied - inactive tenant", {
        action: "tenant_api_key.tenant_inactive",
        keyIdentifier,
        tenantId: keyRecord.tenantId,
      });
      throw new ForbiddenError(AuthMessages.TENANT_INACTIVE);
    }

    // Throttled update of lastAccessedAt (fire-and-forget if > 60 seconds)
    const now = new Date();
    const shouldUpdate =
      !keyRecord.lastAccessedAt ||
      now.getTime() - keyRecord.lastAccessedAt.getTime() > THROTTLE_UPDATE_MS;

    if (shouldUpdate) {
      this.repository
        .updateLastAccessedAt(keyRecord.id, now)
        .catch((err) => {
          this.logger?.warn("Failed to update lastAccessedAt for API key", {
            action: "tenant_api_key.update_last_accessed_failed",
            apiKeyId: keyRecord.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    return keyRecord;
  }
}
