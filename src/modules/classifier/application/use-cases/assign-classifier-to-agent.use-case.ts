import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";

export class AssignClassifierToAgentUseCase {
  constructor(private readonly repo: ClassifierRepository) {}

  async execute(platformAgentId: string, classifierDispositionIds: string[]) {
    await this.repo.assignToAgent(platformAgentId, classifierDispositionIds);
  }
}
