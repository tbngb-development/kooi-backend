import type { BolnaApiKeyWithCount } from "../interfaces/bolna-api-key-repository.interface";
import type { BolnaApiKeyResponse } from "../dto/bolna-api-key.dto";

/**
 * Never exposes encryptedKey to any API response.
 */
export function toBolnaApiKeyResponse(
  key: BolnaApiKeyWithCount,
): BolnaApiKeyResponse {
  return {
    id: key.id,
    keyIdentifier: key.keyIdentifier,
    type: key.type,
    isPlatformDefault: key.isPlatformDefault,
    isActive: key.isActive,
    assignedTenantCount: key._count.tenants,
    lastAccessedAt: key.lastAccessedAt?.toISOString() ?? null,
    createdBy: key.createdBy,
    createdAt: key.createdAt.toISOString(),
    updatedAt: key.updatedAt.toISOString(),
  };
}
