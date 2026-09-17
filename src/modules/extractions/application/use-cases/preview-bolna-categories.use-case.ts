import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import type { PlatformAgentRepository } from "../../../platform-agents/application/interfaces/platform-agent-repository.interface";
import type { BolnaExtractionCategoryListResponse } from "../../../../shared/types/bolna.types";
import { PlatformAgentNotFoundError } from "../../../platform-agents/domain/errors/platform-agent.errors";

export class PreviewBolnaCategoriesUseCase {
  constructor(
    private readonly extractionProvider: BolnaExtractionProvider,
    private readonly agentRepository: PlatformAgentRepository,
  ) {}

  /**
   * Accepts either internal platformAgentId or bolnaAgentId.
   */
  async execute(
    bolnaAgentId: string,
  ): Promise<BolnaExtractionCategoryListResponse> {
    // 1. Try finding agent by internal DB ID or Bolna ID
    const agent = await this.agentRepository.findByBolnaId(bolnaAgentId);

    if (!agent) {
      throw new PlatformAgentNotFoundError(bolnaAgentId);
    }

    // 2. Use the real Bolna Agent ID & the Agent's associated BolnaApiKeyId
    return this.extractionProvider.listCategories(
      agent.bolnaId,
      agent.bolnaApiKeyId,
    );
  }
}
