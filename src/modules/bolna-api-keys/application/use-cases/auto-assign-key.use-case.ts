import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";

/**
 * Called during tenant onboarding (after payment success).
 * Assigns the least-loaded GENERAL pool key to the new tenant.
 */
export class AutoAssignKeyUseCase {
  constructor(private readonly repo: BolnaApiKeyRepository) {}

  async execute(
    tenantId: string,
  ): Promise<{ keyId: string; keyIdentifier: string }> {
    const assigned = await this.repo.assignLeastLoadedKeyToTenant(tenantId);
    return { keyId: assigned.id, keyIdentifier: assigned.keyIdentifier };
  }
}
