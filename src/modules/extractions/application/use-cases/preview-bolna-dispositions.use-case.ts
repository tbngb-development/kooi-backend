import type { BolnaExtractionProvider } from "../interfaces/bolna-extraction-provider.interface";
import type { PlatformAgentRepository } from "../../../platform-agents/application/interfaces/platform-agent-repository.interface";
import type { BolnaDispositionResponse } from "../../../../shared/types/bolna.types";
import { PlatformAgentNotFoundError } from "../../../platform-agents/domain/errors/platform-agent.errors";

export class PreviewBolnaDispositionsUseCase {
  constructor(
    private readonly extractionProvider: BolnaExtractionProvider,
    private readonly agentRepository: PlatformAgentRepository,
  ) {}

  async execute(bolnaAgentId: string): Promise<BolnaDispositionResponse[]> {
    const agent = await this.agentRepository.findByBolnaId(bolnaAgentId);

    if (!agent) {
      throw new PlatformAgentNotFoundError(bolnaAgentId);
    }

    return this.extractionProvider.listDispositions(
      agent.bolnaId,
      agent.bolnaApiKeyId,
    );
  }
}
