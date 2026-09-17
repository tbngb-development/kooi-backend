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
import { extractPromptInputFields } from "../../../assistants/infrastructure/promptVariableExtractor";
import type { RequiredVariable } from "../../../../shared/types/bolna.types";

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
    console.log("dto bolnaapi key id: ", dto.bolnaApiKeyId)
    const template = await this.templateProvider.fetchTemplate(
      dto.bolnaId,
      dto.bolnaApiKeyId,
    );

    const name = dto.name || template.agentName || "Imported Agent";
    const slug = dto.slug || generateSlug(name);

    // 4. Prevent duplicate slug
    const existingSlug = await this.repository.findBySlug(slug);
    if (existingSlug) {
      throw new DuplicatePlatformAgentSlugError(slug);
    }

    // 5. Auto-extract prompt variables
    const requiredVariables = this.buildRequiredVariables(
      template.systemPrompt,
      template.welcomeMessage,
    );

    // 6. Create PlatformAgent
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
      welcomeMessage: template.welcomeMessage,
      requiredVariables,
    });

    return platformAgent;
  }

  private buildRequiredVariables(
    systemPrompt: string | null,
    welcomeMessage: string | null,
  ): RequiredVariable[] {
    const fields = extractPromptInputFields(
      systemPrompt ?? "",
      welcomeMessage ?? "",
    );

    return fields.map((field) => ({
      name: field.key,
      label: field.label,
      required: true,
    }));
  }
}
