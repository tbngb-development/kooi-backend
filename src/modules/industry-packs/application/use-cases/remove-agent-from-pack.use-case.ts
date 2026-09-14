import type { IndustryPackRepository } from "../interfaces/industry-pack-repository.interface";
import { PlatformAgentNotFoundError } from "../../domain/errors/industry-pack.errors";
import prisma from "../../../../shared/config/database/prisma";

export class RemoveAgentFromPackUseCase {
  constructor(private readonly repository: IndustryPackRepository) {}

  async execute(agentId: string) {
    const agent = await prisma.platformAgent.findUnique({ where: { id: agentId } });
    if (!agent) throw new PlatformAgentNotFoundError(agentId);

    await this.repository.removeAgentFromPack(agentId);

    return { message: "Agent removed from industry pack" };
  }
}