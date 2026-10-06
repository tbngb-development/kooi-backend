import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import { BolnaApiKeyNotFoundError } from "../../domain/errors/bolna-api-key.errors";

export class ActivateBolnaApiKeyUseCase {
  constructor(private readonly apiKeyRepo: BolnaApiKeyRepository) {}

  async execute(keyId: string) {
    const key = await this.apiKeyRepo.findById(keyId);
    if (!key) throw new BolnaApiKeyNotFoundError(keyId);

    if (key.isActive) {
      return { message: "API key is already active." };
    }

    await this.apiKeyRepo.activate(keyId);

    const affectedTenants = await this.apiKeyRepo.findTenantIdsUsingKey(keyId);

    return {
      message: `API key re-activated. ${affectedTenants.length} tenant(s) are now unfrozen.`,
      unfrozenTenantCount: affectedTenants.length,
    };
  }
}
