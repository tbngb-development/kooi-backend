import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import type { AssignKeyInput } from "../dto/bolna-api-key.dto";
import {
  BolnaApiKeyNotFoundError,
  CannotReassignCustomKeyError,
} from "../../domain/errors/bolna-api-key.errors";

export class AssignKeyToTenantUseCase {
  constructor(private readonly repo: BolnaApiKeyRepository) {}

  async execute(input: AssignKeyInput): Promise<void> {
    const key = await this.repo.findById(input.keyId);
    if (!key) throw new BolnaApiKeyNotFoundError(input.keyId);

    // A CUSTOM key is dedicated — check it isn't already used by another tenant
    if (key.type === "CUSTOM") {
      const currentTenants = await this.repo.findTenantIdsUsingKey(input.keyId);
      const isAssignedToOther = currentTenants.some(
        (id) => id !== input.tenantId,
      );
      if (isAssignedToOther) throw new CannotReassignCustomKeyError();
    }

    await this.repo.assignKeyToTenant(input.tenantId, input.keyId);
  }
}
