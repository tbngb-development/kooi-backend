import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";

export class RemoveClassifierFromAgentUseCase {
  constructor(private readonly repo: ClassifierRepository) {}

  async execute(platformAgentId: string, classifierDispositionIds: string[]) {
    await this.repo.removeFromAgent(platformAgentId, classifierDispositionIds);
  }
}
