import type { BolnaApiKeyRepository } from "../interfaces/bolna-api-key-repository.interface";
import { BolnaApiKeyNotFoundError } from "../../domain/errors/bolna-api-key.errors";

export interface ListKeyTenantsInput {
  keyId: string;
  page?: number;
  limit?: number;
  search?: string;
}

export class ListKeyTenantsUseCase {
  constructor(private readonly apiKeyRepo: BolnaApiKeyRepository) {}

  async execute(input: ListKeyTenantsInput) {
    const key = await this.apiKeyRepo.findById(input.keyId);
    if (!key) throw new BolnaApiKeyNotFoundError(input.keyId);

    return this.apiKeyRepo.listTenantsForKey(input.keyId, {
      page: input.page ?? 1,
      limit: input.limit ?? 20,
      search: input.search,
    });
  }
}
