import type { ISarvamConfigurationRepository } from "../interfaces/sarvam-configuration-repository.interface";
import type { SarvamConfigurationMapper } from "../mappers/sarvam-configuration.mapper";
import type { SarvamConfigurationResponseDTO } from "../dto/sarvam-configuration.dto";
import { SarvamConfigurationNotFoundError } from "../../domain/errors/sarvam-configuration.errors";

export class GetSarvamConfigurationUseCase {
  constructor(
    private readonly repository: ISarvamConfigurationRepository,
    private readonly mapper: SarvamConfigurationMapper,
  ) {}

  async execute(id: string): Promise<SarvamConfigurationResponseDTO> {
    const config = await this.repository.findById(id);
    if (!config) {
      throw new SarvamConfigurationNotFoundError(id);
    }
    return this.mapper.toResponseDTO(config);
  }
}

