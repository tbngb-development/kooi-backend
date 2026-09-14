import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";

export class SyncPlatformAgentUseCase {
  constructor(
    private readonly repository: PlatformAgentRepository,
    private readonly templateProvider: BolnaTemplateProvider,
  ) {}

  async execute(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new PlatformAgentNotFoundError(id);
    }

    const template = await this.templateProvider.fetchTemplate(existing.bolnaId);

    return this.repository.update(id, {
      defaultConfig: template.defaultConfig,
      systemPrompt: template.systemPrompt,
    });
  }
}