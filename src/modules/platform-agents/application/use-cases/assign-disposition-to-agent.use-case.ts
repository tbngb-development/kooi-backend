import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { ExtractionRepository } from "../../../extractions/application/interfaces/extraction-repository.interface";
import type { AssignDispositionsToAgentDTO } from "../dto/platform-agent.dto";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";
import { ExtractionDispositionNotFoundError } from "../../../extractions/domain/errors/extraction.errors";

const GENERAL_CATEGORY_NAME = "General";

export class AssignDispositionToAgentUseCase {
  constructor(
    private readonly agentRepository: PlatformAgentRepository,
    private readonly extractionRepository: ExtractionRepository,
  ) {}

  async execute(
    platformAgentId: string,
    dto: AssignDispositionsToAgentDTO,
  ): Promise<void> {
    // 1. Verify platform agent exists
    const agent = await this.agentRepository.findById(platformAgentId);
    if (!agent) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }

    // 2. Verify all dispositions exist
    for (const dispositionId of dto.dispositionIds) {
      const disposition =
        await this.extractionRepository.findDispositionById(dispositionId);
      if (!disposition) {
        throw new ExtractionDispositionNotFoundError(dispositionId);
      }
    }

    // 3. Find or create the global "General" category
    const generalCategoryId = await this.findOrCreateGeneralCategory();

    // 4. Attach dispositions to "General" (idempotent via skipDuplicates)
    await this.extractionRepository.attachDispositionsToCategory(
      generalCategoryId,
      dto.dispositionIds,
    );

    // 5. Ensure "General" is assigned to this agent (idempotent)
    await this.agentRepository.assignCategoriesToAgent(platformAgentId, [
      generalCategoryId,
    ]);
  }

  /**
   * Finds the global "General" category by case-insensitive name.
   * Creates it if it doesn't exist. Handles race conditions gracefully.
   */
  private async findOrCreateGeneralCategory(): Promise<string> {
    const existing =
      await this.extractionRepository.findCategoryByNameInsensitive(
        GENERAL_CATEGORY_NAME,
      );

    if (existing) return existing.id;

    try {
      const created = await this.extractionRepository.createCategory({
        name: GENERAL_CATEGORY_NAME,
        model: "gpt-4.1-mini",
        description:
          "Auto-created category for independently assigned dispositions",
      });
      return created.id;
    } catch {
      // Race condition: another request created "General" between
      // our check and insert. Re-fetch and return.
      const retry =
        await this.extractionRepository.findCategoryByNameInsensitive(
          GENERAL_CATEGORY_NAME,
        );
      if (retry) return retry.id;
      throw new Error(
        "Failed to find or create the General extraction category",
      );
    }
  }
}
