import { type BolnaApiKeyRepository } from "../../../bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";
import { type PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import { decryptKey } from "../../../../shared/utils/encryption";
import { BolnaClient } from "../../../../shared/config/external/bolna/bolna.client";
import { env } from "../../../../shared/config/env";
import { type BolnaDiscoveredAgent } from "../dto/platform-agent.dto";
import { PlatformApiKeyMissingError } from "../../domain/errors/platform-agent.errors";
import { BolnaDiscoveryMapper } from "../mappers/bolna-discovery.mapper";

export class ListBolnaAgentsUseCase {
  constructor(
    private readonly apiKeyRepository: BolnaApiKeyRepository,
    private readonly platformAgentRepository: PlatformAgentRepository,
  ) {}

  async execute(bolnaApiKeyId?: string): Promise<BolnaDiscoveredAgent[]> {
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
    const bolnaClient = new BolnaClient(decryptedApiKey, env.bolna.apiUrl);

    // 1. Fetch live Bolna agents
    const bolnaAgents = await bolnaClient.agents.list();

    // 2. Fetch existing platform agents to cross-reference import status
    const existingPlatformAgents = await this.platformAgentRepository.list({});

    // 3. Return mapped structure
    return BolnaDiscoveryMapper.toDiscoveredAgents(
      bolnaAgents,
      existingPlatformAgents,
    );
  }
}
