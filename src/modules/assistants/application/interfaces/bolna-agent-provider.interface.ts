import type { BolnaAgentResponse } from "../../../../shared/types/bolna.types";

export interface BolnaAgentProvider {
  verifyAgent(tenantId: string, agentId: string): Promise<BolnaAgentResponse>;
  listAgents(tenantId: string): Promise<BolnaAgentResponse[]>;
}