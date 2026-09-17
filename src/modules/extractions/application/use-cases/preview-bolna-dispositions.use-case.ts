import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";

export class PreviewBolnaDispositionsUseCase {
  constructor(private readonly bolnaProvider: BolnaExtractionProvider) {}

  /**
   * Read-only: fetches dispositions from Bolna for preview/reference.
   * Does NOT store anything locally.
   */
  async execute(bolnaApiKeyId: string, agentBolnaId?: string) {
    return this.bolnaProvider.listDispositions(bolnaApiKeyId, agentBolnaId);
  }
}
