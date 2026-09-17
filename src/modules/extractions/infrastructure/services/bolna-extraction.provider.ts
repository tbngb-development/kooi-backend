import { decryptKey } from "../../../../shared/utils/encryption";
import { BolnaClient } from "../../../../shared/config/external/bolna/bolna.client";
import { env } from "../../../../shared/config/env";
import type { BolnaApiKeyRepository } from "../../../bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";
import type { BolnaExtractionProvider } from "../../application/interfaces/bolna-extraction-provider.interface";
import type {
  BolnaCategoryCreatePayload,
  BolnaDispositionCreatePayload,
  BolnaDispositionCreateResponse,
  BolnaExtractionCategoryListResponse,
  BolnaExtractionCategoryResponse,
  BolnaDispositionResponse,
} from "../../../../shared/types/bolna.types";
import { PlatformApiKeyMissingError } from "../../../platform-agents/domain/errors/platform-agent.errors";

export class BolnaExtractionProviderImpl implements BolnaExtractionProvider {
  constructor(private readonly apiKeyRepository: BolnaApiKeyRepository) {}

  private async getClient(bolnaApiKeyId?: string): Promise<BolnaClient> {
    // eslint-disable-next-line no-useless-assignment
    let keyRecord = null;

    if (bolnaApiKeyId) {
      keyRecord = await this.apiKeyRepository.findById(bolnaApiKeyId);
    } else {
      const keys = await this.apiKeyRepository.list();
      keyRecord = keys.find((k) => k.isPlatformDefault && k.isActive);
    }

    if (!keyRecord || !keyRecord.isActive) {
      throw new PlatformApiKeyMissingError();
    }

    const decryptedApiKey = decryptKey(keyRecord.encryptedKey);
    return new BolnaClient(decryptedApiKey, env.bolna.apiUrl);
  }

  async listCategories(
    agentId: string,
    bolnaApiKeyId?: string,
  ): Promise<BolnaExtractionCategoryListResponse> {
    const client = await this.getClient(bolnaApiKeyId);
    return client.extractions.listCategories(agentId);
  }

  async listDispositions(
    agentId?: string,
    bolnaApiKeyId?: string,
  ): Promise<BolnaDispositionResponse[]> {
    const client = await this.getClient(bolnaApiKeyId);
    return client.extractions.listDispositions(agentId);
  }

  async createCategory(
    agentId: string,
    payload: BolnaCategoryCreatePayload,
    bolnaApiKeyId?: string,
  ): Promise<BolnaExtractionCategoryResponse> {
    const client = await this.getClient(bolnaApiKeyId);
    return client.extractions.createCategory(agentId, payload);
  }

  async createDisposition(
    payload: BolnaDispositionCreatePayload,
    bolnaApiKeyId?: string,
  ): Promise<BolnaDispositionCreateResponse> {
    const client = await this.getClient(bolnaApiKeyId);
    return client.extractions.createDisposition(payload);
  }

  async updateDisposition(
    dispositionId: string,
    payload: Partial<BolnaDispositionCreatePayload>,
    bolnaApiKeyId?: string,
  ): Promise<void> {
    const client = await this.getClient(bolnaApiKeyId);
    // Explicitly consume the result and return void to satisfy type contracts
    await client.extractions.updateDisposition(dispositionId, payload);
  }

  async deleteDisposition(
    dispositionId: string,
    bolnaApiKeyId?: string,
  ): Promise<void> {
    const client = await this.getClient(bolnaApiKeyId);
    await client.extractions.deleteDisposition(dispositionId);
  }

  async deleteCategory(
    categoryId: string,
    bolnaApiKeyId?: string,
  ): Promise<void> {
    const client = await this.getClient(bolnaApiKeyId);
    await client.extractions.deleteCategory(categoryId);
  }
}
