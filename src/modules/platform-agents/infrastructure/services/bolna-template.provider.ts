import { BolnaClient } from "../../../../shared/config/external/bolna/bolna.client";
import { decryptKey } from "../../../../shared/utils/encryption";
import { env } from "../../../../shared/config/env";
import prisma from "../../../../shared/config/database/prisma";
import type {
  BolnaTemplateProvider,
  BolnaTemplateData,
} from "../../application/interfaces/bolna-template-provider.interface";
import {
  PlatformApiKeyMissingError,
  BolnaTemplateFetchError,
} from "../../domain/errors/platform-agent.errors";
import type {
  BolnaAgentResponse,
  BolnaExtractionCategoryListResponse,
} from "../../../../shared/types/bolna.types";
import { type BolnaApiKeyRepository } from "../../../bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";

export class BolnaTemplateProviderImpl implements BolnaTemplateProvider {
  constructor(private readonly apiKeyRepository: BolnaApiKeyRepository) {}

  private async getPlatformClient(): Promise<BolnaClient> {
    const keyRecord = await prisma.bolnaApiKey.findFirst({
      where: { isPlatformDefault: true, isActive: true },
    });

    if (!keyRecord) {
      throw new PlatformApiKeyMissingError();
    }

    const decryptedKey = decryptKey(keyRecord.encryptedKey);
    return new BolnaClient(decryptedKey, env.bolna.apiUrl);
  }

  async fetchTemplate(
    bolnaId: string,
    bolnaApiKeyId?: string,
  ): Promise<BolnaTemplateData> {
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
    const client = new BolnaClient(decryptedApiKey, env.bolna.apiUrl);

    try {
      const agent = await client.agents.verify(bolnaId);
      const systemPrompt =
        agent.agent_prompts?.task_1?.system_prompt?.trim() ?? null;

      return {
        bolnaId: agent.id,
        agentName: agent.agent_name,
        systemPrompt,
        defaultConfig: agent as unknown as Record<string, unknown>,
      };
    } catch (err: any) {
      throw new BolnaTemplateFetchError(
        err?.message || "Agent not found in the selected Bolna workspace",
      );
    }
  }

  async listAllAgents(): Promise<BolnaAgentResponse[]> {
    const client = await this.getPlatformClient();
    try {
      return await client.agents.list();
    } catch (err: any) {
      const reason =
        err?.response?.data?.message ?? err?.message ?? "Unknown error";
      throw new BolnaTemplateFetchError(reason);
    }
  }

  async listCategories(
    agentBolnaId: string,
  ): Promise<BolnaExtractionCategoryListResponse> {
    const client = await this.getPlatformClient();
    try {
      return await client.extractions.listCategories(agentBolnaId);
    } catch (err: any) {
      const reason =
        err?.response?.data?.message ?? err?.message ?? "Unknown error";
      throw new BolnaTemplateFetchError(reason);
    }
  }
}
