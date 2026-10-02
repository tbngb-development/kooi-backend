import { type BolnaAgentProvider } from "../interfaces/bolna-agent-provider.interface";
import { type BolnaAgentResponse } from "../../../../shared/types/bolna.types";

export class ListBolnaAgentsUseCase {
  constructor(private readonly bolnaProvider: BolnaAgentProvider) {}

  async execute(tenantId: string): Promise<BolnaAgentResponse[]> {
    return this.bolnaProvider.listAgents(tenantId);
  }
}
