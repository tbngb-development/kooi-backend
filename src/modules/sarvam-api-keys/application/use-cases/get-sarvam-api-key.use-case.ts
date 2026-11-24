import type { ISarvamApiKeyRepository } from "../interfaces/sarvam-api-key-repository.interface";
import type { SarvamApiKeyMapper } from "../mappers/sarvam-api-key.mapper";
import type { SarvamApiKeyResponseDTO } from "../dto/sarvam-api-key.dto";
import { SarvamApiKeyNotFoundError } from "../../domain/errors/sarvam-api-key.errors";

export class GetSarvamApiKeyUseCase {
  constructor(
    private readonly repository: ISarvamApiKeyRepository,
    private readonly mapper: SarvamApiKeyMapper,
  ) {}

  async execute(id: string): Promise<SarvamApiKeyResponseDTO> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new SarvamApiKeyNotFoundError(id);
    }
    return this.mapper.toResponseDTO(record);
  }
}

