import type { ISarvamApiKeyRepository } from "../interfaces/sarvam-api-key-repository.interface";
import { SarvamApiKeyNotFoundError } from "../../domain/errors/sarvam-api-key.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class DeleteSarvamApiKeyUseCase {
  constructor(
    private readonly repository: ISarvamApiKeyRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(id: string, deletedBy?: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new SarvamApiKeyNotFoundError(id);
    }

    await this.repository.delete(id);

    this.logger?.info("Deleted Sarvam API key", {
      action: "sarvam_api_key.deleted",
      keyId: id,
      tenantId: existing.tenantId,
      deletedBy,
    });
  }
}

