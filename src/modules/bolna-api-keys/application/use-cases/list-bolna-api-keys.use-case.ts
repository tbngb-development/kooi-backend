import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import type { BolnaApiKeyResponse } from "../dto/bolna-api-key.dto";
import { toBolnaApiKeyResponse } from "../mappers/bolna-api-key.mapper";

export class ListBolnaApiKeysUseCase {
  constructor(private readonly repo: BolnaApiKeyRepository) {}

  async execute(): Promise<BolnaApiKeyResponse[]> {
    const keys = await this.repo.list();
    return keys.map(toBolnaApiKeyResponse);
  }
}
