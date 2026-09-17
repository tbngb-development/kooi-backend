import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import type { AssignCategoriesToAgentDTO } from "../dto/platform-agent.dto";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";
import { ExtractionCategoryNotFoundError } from "../../../extractions/domain/errors/extraction.errors";

export class AssignCategoryToAgentUseCase {
  constructor(
    private readonly agentRepository: PlatformAgentRepository,
    private readonly extractionRepository: ExtractionRepository,
  ) {}

  async execute(
    platformAgentId: string,
    dto: AssignCategoriesToAgentDTO,
  ): Promise<void> {
    // 1. Verify platform agent exists
    const agent = await this.agentRepository.findById(platformAgentId);
    if (!agent) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }

    // 2. Verify all categories exist
    for (const categoryId of dto.categoryIds) {
      const category =
        await this.extractionRepository.findCategoryById(categoryId);
      if (!category) {
        throw new ExtractionCategoryNotFoundError(categoryId);
      }
    }

    // 3. Assign (idempotent — skipDuplicates in repo)
    await this.agentRepository.assignCategoriesToAgent(
      platformAgentId,
      dto.categoryIds,
    );
  }
}
