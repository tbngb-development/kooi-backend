import type { IndustryPackRepository } from "../interfaces/industry-pack-repository.interface";
import prisma from "../../../../shared/config/database/prisma";
import { PlatformAgentNotFoundError } from "../../../platform-agents/domain/errors/platform-agent.errors";

export class RemoveAgentFromPackUseCase {
  constructor(private readonly repository: IndustryPackRepository) {}

  async execute(agentId: string) {
    const agent = await prisma.platformAgent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new PlatformAgentNotFoundError(agentId);

    await this.repository.removeAgentFromPack(agentId);

    return { message: "Agent removed from industry pack" };
  }
}
