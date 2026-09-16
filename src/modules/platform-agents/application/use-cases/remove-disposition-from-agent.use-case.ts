import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";

const GENERAL_CATEGORY_NAME = "General";

export class RemoveDispositionFromAgentUseCase {
  constructor(
    private readonly agentRepository: PlatformAgentRepository,
    private readonly extractionRepository: ExtractionRepository,
  ) {}

  async execute(platformAgentId: string, dispositionId: string): Promise<void> {
    // 1. Verify agent exists
    const agent = await this.agentRepository.findById(platformAgentId);
    if (!agent) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }

    // 2. Load agent's extraction config to find the "General" category
    const config =
      await this.agentRepository.getAgentExtractionConfig(platformAgentId);
    if (!config) return;

    const generalCategory = config.categories.find(
      (c) =>
        c.categoryName.toLowerCase() === GENERAL_CATEGORY_NAME.toLowerCase(),
    );

    if (!generalCategory) return; // No "General" on this agent — nothing to do

    // 3. Detach disposition from "General"
    await this.extractionRepository.detachDispositionFromCategory(
      generalCategory.categoryId,
      dispositionId,
    );

    // 4. If "General" is now empty, auto-remove it from this agent
    const remainingCount =
      await this.extractionRepository.countDispositionsInCategory(
        generalCategory.categoryId,
      );

    if (remainingCount === 0) {
      await this.agentRepository.removeCategoryFromAgent(
        platformAgentId,
        generalCategory.categoryId,
      );
    }
  }
}
