import type { SarvamAgentTenantOverride, Prisma } from "@prisma/client";
import prisma from "../../../../shared/config/database/prisma";
import type { ISarvamAgentOverrideRepository } from "../../application/interfaces/sarvam-agent-override-repository.interface";

export class PrismaSarvamAgentOverrideRepository
  implements ISarvamAgentOverrideRepository
{
  async findByAgentAndTenant(
    agentId: string,
    tenantId: string,
  ): Promise<SarvamAgentTenantOverride | null> {
    return prisma.sarvamAgentTenantOverride.findUnique({
      where: {
        agentId_tenantId: {
          agentId,
          tenantId,
        },
      },
    });
  }

  async upsertVariables(
    agentId: string,
    tenantId: string,
    variableOverrides: Record<string, string>,
  ): Promise<SarvamAgentTenantOverride> {
    const jsonOverrides = variableOverrides as unknown as Prisma.InputJsonValue;

    return prisma.sarvamAgentTenantOverride.upsert({
      where: {
        agentId_tenantId: {
          agentId,
          tenantId,
        },
      },
      create: {
        agentId,
        tenantId,
        variableOverrides: jsonOverrides,
      },
      update: {
        variableOverrides: jsonOverrides,
      },
    });
  }

  async upsertWelcomeMessage(
    agentId: string,
    tenantId: string,
    customMessage: string | null,
  ): Promise<SarvamAgentTenantOverride> {
    return prisma.sarvamAgentTenantOverride.upsert({
      where: {
        agentId_tenantId: {
          agentId,
          tenantId,
        },
      },
      create: {
        agentId,
        tenantId,
        welcomeMessage: customMessage,
      },
      update: {
        welcomeMessage: customMessage,
      },
    });
  }

  async delete(agentId: string, tenantId: string): Promise<void> {
    await prisma.sarvamAgentTenantOverride.deleteMany({
      where: {
        agentId,
        tenantId,
      },
    });
  }
}

