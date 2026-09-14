import type { IndustryPackRepository } from "../interfaces/industry-pack-repository.interface";
import {
  IndustryPackNotFoundError,
  PlatformAgentNotFoundError,
} from "../../domain/errors/industry-pack.errors";
import prisma from "../../../../shared/config/database/prisma";

export class AssignAgentToPackUseCase {
  constructor(private readonly repository: IndustryPackRepository) {}

  async execute(agentId: string, packId: string) {
    const pack = await this.repository.findById(packId);
    if (!pack) throw new IndustryPackNotFoundError(packId);

    const agent = await prisma.platformAgent.findUnique({ where: { id: agentId } });
    if (!agent) throw new PlatformAgentNotFoundError(agentId);

    await this.repository.assignAgentToPack(agentId, packId, pack.industry);

    return this.repository.findByIdFull(packId);
  }
}