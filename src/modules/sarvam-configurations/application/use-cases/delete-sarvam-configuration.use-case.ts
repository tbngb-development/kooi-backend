import type { ISarvamConfigurationRepository } from "../interfaces/sarvam-configuration-repository.interface";
import { SarvamConfigurationNotFoundError } from "../../domain/errors/sarvam-configuration.errors";
import type { Logger } from "../../../../shared/logging/logger.interface";

export class DeleteSarvamConfigurationUseCase {
  constructor(
    private readonly repository: ISarvamConfigurationRepository,
    private readonly logger?: Logger,
  ) {}

  async execute(id: string, deletedBy?: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new SarvamConfigurationNotFoundError(id);
    }

    await this.repository.delete(id);

    this.logger?.info("Deleted Sarvam configuration", {
      action: "sarvam_configuration.deleted",
      configurationId: id,
      tenantId: existing.tenantId,
      deletedBy,
    });
  }
}

