import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";

export class PreviewBolnaCategoriesUseCase {
  constructor(private readonly bolnaProvider: BolnaExtractionProvider) {}

  /**
   * Read-only: fetches categories from Bolna for preview/reference.
   * Does NOT store anything locally.
   */
  async execute(agentBolnaId: string) {
    return this.bolnaProvider.listCategories(agentBolnaId);
  }
}
