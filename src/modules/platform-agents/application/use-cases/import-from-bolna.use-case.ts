import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import type { BolnaApiKeyRepository } from "../../../bolna-api-keys/application/interfaces/bolna-api-key-repository.interface";
import {
  DuplicatePlatformAgentSlugError,
  DuplicatePlatformAgentBolnaIdError,
  PlatformApiKeyMissingError,
} from "../../domain/errors/platform-agent.errors";
import { generateSlug } from "../../../extractions/domain/rules/slug-generator";

export interface ImportFromBolnaDTO {
  bolnaId: string;
  bolnaApiKeyId: string;
  slug?: string;
  name?: string;
  industryPackId?: string;
  category?: string;
  description?: string;
  isFeatured?: boolean;
  sortOrder?: number;
  includeExtractions?: boolean;
}

export class ImportFromBolnaUseCase {
  constructor(
    private readonly repository: PlatformAgentRepository,
    private readonly extractionRepository: ExtractionRepository,
    private readonly templateProvider: BolnaTemplateProvider,
    private readonly apiKeyRepository: BolnaApiKeyRepository,
  ) {}

  async execute(dto: ImportFromBolnaDTO) {
    // 1. Resolve Bolna API Key: Use provided key or fall back to platform default key
    let apiKeyId = dto.bolnaApiKeyId;
    if (!apiKeyId) {
      const keys = await this.apiKeyRepository.list();
      const defaultKey = keys.find((k) => k.isPlatformDefault && k.isActive);
      if (!defaultKey) {
        throw new PlatformApiKeyMissingError();
      }
      apiKeyId = defaultKey.id;
    }

    // 2. Prevent duplicate Bolna ID
    const existingBolna = await this.repository.findByBolnaId(dto.bolnaId);
    if (existingBolna) {
      throw new DuplicatePlatformAgentBolnaIdError(dto.bolnaId);
    }

    // 3. Fetch remote agent configuration from Bolna
    const template = await this.templateProvider.fetchTemplate(dto.bolnaId, dto.bolnaApiKeyId);

    const name = dto.name || template.agentName || "Imported Agent";
    const slug = dto.slug || generateSlug(name);

    // 4. Prevent duplicate slug
    const existingSlug = await this.repository.findBySlug(slug);
    if (existingSlug) {
      throw new DuplicatePlatformAgentSlugError(slug);
    }

    // 5. Create PlatformAgent
    const platformAgent = await this.repository.create({
      bolnaId: dto.bolnaId,
      bolnaApiKeyId: apiKeyId,
      slug,
      name,
      industryPackId: dto.industryPackId,
      category: dto.category,
      description: dto.description,
      isFeatured: dto.isFeatured ?? false,
      sortOrder: dto.sortOrder ?? 0,
      defaultConfig: template.defaultConfig,
      systemPrompt: template.systemPrompt,
    });

    return platformAgent;
  }
}
