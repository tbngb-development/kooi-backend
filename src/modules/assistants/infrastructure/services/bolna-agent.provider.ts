import type { BolnaAgentProvider } from "../../application/interfaces/bolna-agent-provider.interface";
import type { IBolnaClientFactory } from "../../../../shared/config/external/bolna/bolna-client.factory";
import type { BolnaAgentResponse } from "../../../../shared/types/bolna.types";

export class BolnaAgentProviderImpl implements BolnaAgentProvider {
  constructor(private readonly bolnaFactory: IBolnaClientFactory) {}

  async verifyAgent(
    tenantId: string,
    agentId: string,
  ): Promise<BolnaAgentResponse> {
    const bolnaClient = await this.bolnaFactory.forTenant(tenantId);
    return bolnaClient.agents.verify(agentId);
  }

  async listAgents(tenantId: string): Promise<BolnaAgentResponse[]> {
    const bolnaClient = await this.bolnaFactory.forTenant(tenantId);
    return bolnaClient.agents.list();
  }
}
