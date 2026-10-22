import type { ITenantApiKeyRepository } from "../interfaces/tenant-api-key-repository.interface";
import { NotFoundError } from "../../../../shared/errors/not-found.error";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class DeleteTenantApiKeyUseCase {
  constructor(
    private readonly repository: ITenantApiKeyRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(id: string, tenantId: string, userId: string): Promise<void> {
    const deleted = await this.repository.deleteByIdAndTenantId(id, tenantId);

    if (!deleted) {
      throw new NotFoundError("API key");
    }

    this.logger?.info("Tenant API key deleted and revoked", {
      action: "tenant_api_key.delete",
      apiKeyId: id,
      tenantId,
      userId,
    });
  }
}
