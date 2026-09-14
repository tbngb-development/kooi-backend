import type { BolnaTemplateProvider } from "../interfaces/bolna-template-provider.interface";
import prisma from "../../../../shared/config/database/prisma";

export class ListBolnaAgentsUseCase {
  constructor(private readonly templateProvider: BolnaTemplateProvider) {}

  async execute() {
    const agents = await this.templateProvider.listAllAgents();

    const importedAgents = await prisma.platformAgent.findMany({
      select: { bolnaId: true, id: true, slug: true, name: true },
    });

    const importedMap = new Map(importedAgents.map((a) => [a.bolnaId, a]));

    return agents.map((agent) => {
      const existing = importedMap.get(agent.id);
      return {
        bolnaId: agent.id,
        agentName: agent.agent_name,
        agentType: agent.agent_type,
        agentStatus: agent.agent_status,
        createdAt: agent.created_at,
        updatedAt: agent.updated_at,
        alreadyImported: !!existing,
        kooiPlatformAgentId: existing?.id ?? null,
        kooiSlug: existing?.slug ?? null,
      };
    });
  }
}
