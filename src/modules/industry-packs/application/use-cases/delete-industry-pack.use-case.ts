import type { IndustryPackRepository } from "../interfaces/industry-pack-repository.interface";
import {
  IndustryPackNotFoundError,
  IndustryPackHasAgentsError,
} from "../../domain/errors/industry-pack.errors";

export class DeleteIndustryPackUseCase {
  constructor(private readonly repository: IndustryPackRepository) {}

  async execute(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new IndustryPackNotFoundError(id);

    const agentCount = await this.repository.countAgentsInPack(id);
    if (agentCount > 0) throw new IndustryPackHasAgentsError(agentCount);

    await this.repository.delete(id);
  }
}