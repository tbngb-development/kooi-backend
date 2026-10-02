import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import { BolnaApiKeyNotFoundError } from "../../domain/errors/bolna-api-key.errors";

export interface DeactivateApiKeyOutput {
  keyId: string;
  reassignedTenantCount: number;
}

/**
 * Deactivates a key and reassigns all tenants currently using it
 * to the next least-loaded GENERAL key.
 */
export class DeactivateBolnaApiKeyUseCase {
  constructor(private readonly repo: BolnaApiKeyRepository) {}

  async execute(keyId: string): Promise<DeactivateApiKeyOutput> {
    const key = await this.repo.findById(keyId);
    if (!key) throw new BolnaApiKeyNotFoundError(keyId);

    await this.repo.deactivate(keyId);
    const reassigned = await this.repo.reassignTenantsFromKey(keyId);

    return { keyId, reassignedTenantCount: reassigned };
  }
}
