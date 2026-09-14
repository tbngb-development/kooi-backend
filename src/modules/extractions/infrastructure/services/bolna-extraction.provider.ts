import { BolnaClient } from "../../../../shared/config/external/bolna/bolna.client";
import { decryptKey } from "../../../../shared/utils/encryption";
import { env } from "../../../../shared/config/env";
import prisma from "../../../../shared/config/database/prisma";
import type {
  BolnaExtractionProvider,
} from "../../application/interfaces/bolna-extraction-provider.interface";
import type {
  BolnaExtractionCategoryListResponse,
  BolnaExtractionCategoryResponse,
  BolnaDispositionResponse,
  BolnaDispositionCreatePayload,
  BolnaDispositionCreateResponse,
  BolnaCategoryCreatePayload,
} from "../../../../shared/types/bolna.types";
import { PlatformApiKeyMissingError } from "../../../platform-agents/domain/errors/platform-agent.errors";
import { ExtractionSyncError } from "../../domain/errors/extraction.errors";

export class BolnaExtractionProviderImpl implements BolnaExtractionProvider {
  private async getPlatformClient(): Promise<BolnaClient> {
    const keyRecord = await prisma.bolnaApiKey.findFirst({
      where: { isPlatformDefault: true, isActive: true },
    });
    if (!keyRecord) throw new PlatformApiKeyMissingError();

    const decryptedKey = decryptKey(keyRecord.encryptedKey);
    return new BolnaClient(decryptedKey, env.bolna.apiUrl);
  }

  private async safeCall<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      const reason = err?.response?.data?.message ?? err?.message ?? "Unknown error";
      throw new ExtractionSyncError(`${operation}: ${reason}`);
    }
  }

  async listCategories(agentBolnaId: string): Promise<BolnaExtractionCategoryListResponse> {
    const client = await this.getPlatformClient();
    return this.safeCall("listCategories", () => client.extractions.listCategories(agentBolnaId));
  }

  async createCategory(agentBolnaId: string, payload: BolnaCategoryCreatePayload): Promise<BolnaExtractionCategoryResponse> {
    const client = await this.getPlatformClient();
    return this.safeCall("createCategory", () => client.extractions.createCategory(agentBolnaId, payload));
  }

  async updateCategory(bolnaCategoryId: string, payload: Partial<BolnaCategoryCreatePayload>): Promise<BolnaExtractionCategoryResponse> {
    const client = await this.getPlatformClient();
    return this.safeCall("updateCategory", () => client.extractions.updateCategory(bolnaCategoryId, payload));
  }

  async deleteCategory(bolnaCategoryId: string): Promise<void> {
    const client = await this.getPlatformClient();
    return this.safeCall("deleteCategory", () => client.extractions.deleteCategory(bolnaCategoryId));
  }

  async listDispositions(agentBolnaId?: string): Promise<BolnaDispositionResponse[]> {
    const client = await this.getPlatformClient();
    return this.safeCall("listDispositions", () => client.extractions.listDispositions(agentBolnaId));
  }

  async createDisposition(payload: BolnaDispositionCreatePayload): Promise<BolnaDispositionCreateResponse> {
    const client = await this.getPlatformClient();
    return this.safeCall("createDisposition", () => client.extractions.createDisposition(payload));
  }

  async updateDisposition(bolnaDispositionId: string, payload: Partial<BolnaDispositionCreatePayload>): Promise<BolnaDispositionCreateResponse> {
    const client = await this.getPlatformClient();
    return this.safeCall("updateDisposition", () => client.extractions.updateDisposition(bolnaDispositionId, payload));
  }

  async deleteDisposition(bolnaDispositionId: string): Promise<void> {
    const client = await this.getPlatformClient();
    return this.safeCall("deleteDisposition", () => client.extractions.deleteDisposition(bolnaDispositionId));
  }
}