import type { ClassifierRepository } from "../interfaces/classifier-repository.interface";

export class ListAgentClassifiersUseCase {
  constructor(private readonly repo: ClassifierRepository) {}

  async execute(platformAgentId: string) {
    return this.repo.listAgentClassifiers(platformAgentId);
  }
}