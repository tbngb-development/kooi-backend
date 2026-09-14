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

export class BolnaTemplateProviderImpl implements BolnaTemplateProvider {
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

  async fetchTemplate(bolnaId: string): Promise<BolnaTemplateData> {
    const client = await this.getPlatformClient();

    let agentData;
    try {
      agentData = await client.agents.verify(bolnaId);
    } catch (err: any) {
      const reason =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        err?.message ??
        "Unknown error";
      throw new BolnaTemplateFetchError(reason);
    }

    const systemPrompt = agentData.agent_prompts?.task_1?.system_prompt ?? null;

    const defaultConfig = {
      agent_type: agentData.agent_type,
      agent_welcome_message: agentData.agent_welcome_message,
      tasks: agentData.tasks,
    };

    return {
      bolnaId: agentData.id,
      agentName: agentData.agent_name,
      defaultConfig,
      systemPrompt,
    };
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
