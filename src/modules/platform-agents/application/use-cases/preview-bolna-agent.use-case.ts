import { type BolnaApiKeyRepository } from "../../../bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";
import { type PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import { type ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import { decryptKey } from "../../../../shared/utils/encryption";
import { BolnaClient } from "../../../../shared/config/external/bolna/bolna.client";
import { env } from "../../../../shared/config/env";
import { type BolnaAgentBlueprintPreview } from "../dto/platform-agent.dto";
import { PlatformApiKeyMissingError } from "../../domain/errors/platform-agent.errors";
import { BolnaDiscoveryMapper } from "../mappers/bolna-discovery.mapper";

export class PreviewBolnaAgentUseCase {
  constructor(
    private readonly apiKeyRepository: BolnaApiKeyRepository,
    private readonly platformAgentRepository: PlatformAgentRepository,
    private readonly extractionRepository: ExtractionRepository,
  ) {}

  async execute(
    bolnaId: string,
    bolnaApiKeyId?: string,
  ): Promise<BolnaAgentBlueprintPreview> {
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

    // 1. Fetch remote agent details
    const agent = await bolnaClient.agents.verify(bolnaId);

    // 2. Check if already imported locally
    const existingPA = await this.platformAgentRepository.findByBolnaId(bolnaId);

    // 3. Fetch remote extractions for this agent (if any)
    // eslint-disable-next-line no-useless-assignment
    let rawCategories: any[] = [];
    try {
      const extRes = await bolnaClient.extractions.listCategories(bolnaId);
      rawCategories = extRes.categories ?? [];
    } catch {
      rawCategories = [];
    }

    // 4. Fetch local categories and dispositions to detect already imported status
    const [localCategories, localDispositions] = await Promise.all([
      this.extractionRepository.listCategories({}),
      this.extractionRepository.listDispositions({}),
    ]);

    const existingCategorySlugs = new Set(localCategories.map((c) => c.slug));
    const existingDispositionSlugs = new Set(
      localDispositions.map((d) => d.slug),
    );

    return BolnaDiscoveryMapper.toBlueprintPreview({
      agent,
      existingPlatformAgent: existingPA
        ? { id: existingPA.id, slug: existingPA.slug }
        : null,
      rawCategories,
      existingCategorySlugs,
      existingDispositionSlugs,
    });
  }
}