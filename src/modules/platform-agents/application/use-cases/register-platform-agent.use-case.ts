import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import type { RegisterPlatformAgentDTO } from "../dto/platform-agent.dto";
import {
  DuplicatePlatformAgentSlugError,
  DuplicatePlatformAgentBolnaIdError,
} from "../../domain/errors/platform-agent.errors";
import { extractPromptInputFields } from "../../../assistants/infrastructure/promptVariableExtractor";
import type { RequiredVariable } from "../../../../shared/types/bolna.types";

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

    const template = await this.templateProvider.fetchTemplate(
      dto.bolnaId,
      dto.bolnaApiKeyId,
    );

    const requiredVariables = this.buildRequiredVariables(
      template.systemPrompt,
      template.welcomeMessage,
    );

    return this.repository.create({
      ...dto,
      defaultConfig: template.defaultConfig,
      systemPrompt: template.systemPrompt,
      welcomeMessage: dto.welcomeMessage ?? template.welcomeMessage,
      requiredVariables: dto.requiredVariables ?? requiredVariables,
    });
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
      isEditable: false,
    }));
  }
}
