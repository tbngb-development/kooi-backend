import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import { BolnaApiKeyNotFoundError } from "../../domain/errors/bolna-api-key.errors";

export class DeactivateBolnaApiKeyUseCase {
  constructor(private readonly apiKeyRepo: BolnaApiKeyRepository) {}

  async execute(keyId: string) {
    const key = await this.apiKeyRepo.findById(keyId);
    if (!key) throw new BolnaApiKeyNotFoundError(keyId);

    if (!key.isActive) {
      return { message: "API key is already inactive." };
    }

    await this.apiKeyRepo.deactivate(keyId);

    // Tenants remain assigned to this key.
    // Their mutations are blocked by assertTenantNotFrozen()
    // which now checks BolnaApiKey.isActive.
    // Re-activate the key to unfreeze tenants.

    const affectedTenants = await this.apiKeyRepo.findTenantIdsUsingKey(keyId);

    return {
      message: `API key deactivated. ${affectedTenants.length} tenant(s) are now frozen.`,
      frozenTenantCount: affectedTenants.length,
    };
  }
}
