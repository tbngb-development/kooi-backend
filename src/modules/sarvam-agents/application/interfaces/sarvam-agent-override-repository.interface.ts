import type { SarvamAgentTenantOverride } from "@prisma/client";

export interface ISarvamAgentOverrideRepository {
  findByAgentAndTenant(
    agentId: string,
    tenantId: string,
  ): Promise<SarvamAgentTenantOverride | null>;

  upsertVariables(
    agentId: string,
    tenantId: string,
    variableOverrides: Record<string, string>,
  ): Promise<SarvamAgentTenantOverride>;

  upsertWelcomeMessage(
    agentId: string,
    tenantId: string,
    customMessage: string | null,
  ): Promise<SarvamAgentTenantOverride>;

  delete(agentId: string, tenantId: string): Promise<void>;
}

