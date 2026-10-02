import type { IndustryPackRepository } from "../interfaces/industry-pack-repository.interface";
import { IndustryPackNotFoundError } from "../../domain/errors/industry-pack.errors";

export class AssignAgentToPackUseCase {
  constructor(private readonly repository: IndustryPackRepository) {}

  async execute(agentId: string, packId: string): Promise<void> {
    const pack = await this.repository.findById(packId);
    if (!pack) {
      throw new IndustryPackNotFoundError(packId);
    }

    await this.repository.assignAgentToPack(agentId, packId);
  }
}