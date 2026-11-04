import type { Prisma } from "@prisma/client";
import prisma from "../../../../shared/config/database/prisma";
import type {
  ISarvamAgentRepository,
  CreateSarvamAgentRecord,
  UpdateSarvamAgentRecord,
  ListSarvamAgentsFilter,
  SarvamAgentWithApiKeyAndTenant,
} from "../../application/interfaces/sarvam-agent-repository.interface";
import type { SarvamAgent } from "@prisma/client";

export class PrismaSarvamAgentRepository implements ISarvamAgentRepository {
  private readonly agentWithApiKeyInclude = {
    apiKey: {
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
          },
        },
      },
    },
  } as const;

  async create(
    data: CreateSarvamAgentRecord,
  ): Promise<SarvamAgentWithApiKeyAndTenant> {
    return prisma.sarvamAgent.create({
      data: {
        name: data.name,
        apiKeyId: data.apiKeyId,
        appId: data.appId,
        appVersion: data.appVersion,
        attemptsPerSecond: data.attemptsPerSecond,
        webhookUrl: data.webhookUrl,
        agentVariables: data.agentVariables as unknown as Prisma.InputJsonValue,
        welcomeMessage: data.welcomeMessage as unknown as Prisma.InputJsonValue,
        outputVariables: data.outputVariables as unknown as Prisma.InputJsonValue,
        allowTenantVisible: data.allowTenantVisible ?? false,
        status: data.status ?? "ACTIVE",
        createdBy: data.createdBy,
      },
      include: this.agentWithApiKeyInclude,
    });
  }

  async update(
    id: string,
    data: UpdateSarvamAgentRecord,
  ): Promise<SarvamAgentWithApiKeyAndTenant> {
    return prisma.sarvamAgent.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.appId !== undefined && { appId: data.appId }),
        ...(data.appVersion !== undefined && { appVersion: data.appVersion }),
        ...(data.attemptsPerSecond !== undefined && {
          attemptsPerSecond: data.attemptsPerSecond,
        }),
        ...(data.webhookUrl !== undefined && { webhookUrl: data.webhookUrl }),
        ...(data.agentVariables !== undefined && {
          agentVariables: data.agentVariables as unknown as Prisma.InputJsonValue,
        }),
        ...(data.welcomeMessage !== undefined && {
          welcomeMessage: data.welcomeMessage as unknown as Prisma.InputJsonValue,
        }),
        ...(data.outputVariables !== undefined && {
          outputVariables: data.outputVariables as unknown as Prisma.InputJsonValue,
        }),
        ...(data.allowTenantVisible !== undefined && {
          allowTenantVisible: data.allowTenantVisible,
        }),
        ...(data.status !== undefined && { status: data.status }),
      },
      include: this.agentWithApiKeyInclude,
    });
  }

  async findById(id: string): Promise<SarvamAgentWithApiKeyAndTenant | null> {
    return prisma.sarvamAgent.findUnique({
      where: { id },
      include: this.agentWithApiKeyInclude,
    });
  }

  async findByApiKeyAndAppId(
    apiKeyId: string,
    appId: string,
  ): Promise<SarvamAgent | null> {
    return prisma.sarvamAgent.findUnique({
      where: {
        apiKeyId_appId: {
          apiKeyId,
          appId,
        },
      },
    });
  }

  async list(filter: ListSarvamAgentsFilter): Promise<{
    items: SarvamAgentWithApiKeyAndTenant[];
    total: number;
  }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: Prisma.SarvamAgentWhereInput = {};

    if (filter.apiKeyId) {
      where.apiKeyId = filter.apiKeyId;
    }

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.tenantId) {
      where.apiKey = {
        tenantId: filter.tenantId,
      };
    }

    if (filter.search && filter.search.trim().length > 0) {
      const search = filter.search.trim();
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { appId: { contains: search, mode: "insensitive" } },
        {
          apiKey: {
            workspaceId: { contains: search, mode: "insensitive" },
          },
        },
        {
          apiKey: {
            organizationId: { contains: search, mode: "insensitive" },
          },
        },
        {
          apiKey: {
            tenant: {
              name: { contains: search, mode: "insensitive" },
            },
          },
        },
        {
          apiKey: {
            tenant: {
              email: { contains: search, mode: "insensitive" },
            },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.sarvamAgent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: this.agentWithApiKeyInclude,
      }),
      prisma.sarvamAgent.count({ where }),
    ]);

    return { items, total };
  }

  async archive(id: string): Promise<SarvamAgentWithApiKeyAndTenant> {
    return prisma.sarvamAgent.update({
      where: { id },
      data: {
        status: "ARCHIVED",
      },
      include: this.agentWithApiKeyInclude,
    });
  }

  async archiveByApiKeyId(apiKeyId: string): Promise<number> {
    const result = await prisma.sarvamAgent.updateMany({
      where: {
        apiKeyId,
        status: "ACTIVE",
      },
      data: {
        status: "ARCHIVED",
      },
    });
    return result.count;
  }

  async listAccessibleForTenant(tenantId: string): Promise<SarvamAgent[]> {
    return prisma.sarvamAgent.findMany({
      where: {
        status: "ACTIVE",
        allowTenantVisible: true,
        apiKey: {
          tenantId,
          isActive: true,
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findAccessibleForTenant(
    id: string,
    tenantId: string,
  ): Promise<SarvamAgent | null> {
    return prisma.sarvamAgent.findFirst({
      where: {
        id,
        status: "ACTIVE",
        allowTenantVisible: true,
        apiKey: {
          tenantId,
          isActive: true,
        },
      },
    });
  }

  async existsForApiKeyAndAppId(
    apiKeyId: string,
    appId: string,
    excludeId?: string,
  ): Promise<boolean> {
    const count = await prisma.sarvamAgent.count({
      where: {
        apiKeyId,
        appId,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
    return count > 0;
  }
}

