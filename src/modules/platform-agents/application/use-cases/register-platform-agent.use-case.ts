import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import type { RegisterPlatformAgentDTO } from "../dto/platform-agent.dto";
import {
  DuplicatePlatformAgentSlugError,
  DuplicatePlatformAgentBolnaIdError,
} from "../../domain/errors/platform-agent.errors";

export class RegisterPlatformAgentUseCase {
  constructor(
    private readonly repository: PlatformAgentRepository,
    private readonly templateProvider: BolnaTemplateProvider,
  ) {}

  async execute(dto: RegisterPlatformAgentDTO) {
    const existingSlug = await this.repository.findBySlug(dto.slug);
    if (existingSlug) {
      throw new DuplicatePlatformAgentSlugError(dto.slug);
    }

    const existingBolna = await this.repository.findByBolnaId(dto.bolnaId);
    if (existingBolna) {
      throw new DuplicatePlatformAgentBolnaIdError(dto.bolnaId);
    }

    const template = await this.templateProvider.fetchTemplate(dto.bolnaId);

    return this.repository.create({
      ...dto,
      defaultConfig: template.defaultConfig,
      systemPrompt: template.systemPrompt,
    });
  }
}
