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
import { SarvamAgentDuplicateAppIdError } from "../../domain/errors/sarvam-agent.errors";

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
    goals: true,
  } as const;

  async create(
    data: CreateSarvamAgentRecord,
  ): Promise<SarvamAgentWithApiKeyAndTenant> {
    return prisma.$transaction(async (tx) => {
      return tx.sarvamAgent.create({
        data: {
          name: data.name,
          apiKeyId: data.apiKeyId,
          appId: data.appId,
          appVersion: data.appVersion,
          attemptsPerSecond: data.attemptsPerSecond,
          gender: data.gender ?? null,
          type: data.type ?? "OUTBOUND",
          audioUrl: data.audioUrl ?? (data.audioRecordings?.[0]?.audioUrl ?? null),
          audioRecordings: (data.audioRecordings ?? []) as unknown as Prisma.InputJsonValue,
          agentVariables: data.agentVariables as unknown as Prisma.InputJsonValue,
          welcomeMessage: data.welcomeMessage as unknown as Prisma.InputJsonValue,
          outputVariables: data.outputVariables as unknown as Prisma.InputJsonValue,
          connectionConfigs: data.connectionConfigs as unknown as Prisma.InputJsonValue,
          retryConfig: data.retryConfig as unknown as Prisma.InputJsonValue,
          ...(data.allowedSchedule !== undefined && {
            allowedSchedule: data.allowedSchedule as unknown as Prisma.InputJsonValue,
          }),
          allowTenantVisible: data.allowTenantVisible ?? false,
          status: data.status ?? "ACTIVE",
          createdBy: data.createdBy,
          ...(data.goals && data.goals.length > 0 && {
            goals: {
              create: data.goals.map((g) => ({
                outputVariableName: g.outputVariableName,
                expectedValue: g.expectedValue,
                displayName: g.displayName,
              })),
            },
          }),
        },
        include: this.agentWithApiKeyInclude,
      });
    });
  }

  async update(
    id: string,
    data: UpdateSarvamAgentRecord,
  ): Promise<SarvamAgentWithApiKeyAndTenant> {
    return prisma.$transaction(async (tx) => {
      if (data.goals !== undefined) {
        const incomingIds = data.goals
          .map((g) => g.id)
          .filter((gid): gid is string => Boolean(gid));

        // Delete removed goals
        await tx.sarvamAgentGoal.deleteMany({
          where: {
            agentId: id,
            ...(incomingIds.length > 0 ? { id: { notIn: incomingIds } } : {}),
          },
        });

        // Upsert/create incoming goals
        for (const goal of data.goals) {
          if (goal.id) {
            await tx.sarvamAgentGoal.update({
              where: { id: goal.id },
              data: {
                outputVariableName: goal.outputVariableName,
                expectedValue: goal.expectedValue,
                displayName: goal.displayName,
              },
            });
          } else {
            await tx.sarvamAgentGoal.create({
              data: {
                agentId: id,
                outputVariableName: goal.outputVariableName,
                expectedValue: goal.expectedValue,
                displayName: goal.displayName,
              },
            });
          }
        }
      }

      return tx.sarvamAgent.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.apiKeyId !== undefined && { apiKeyId: data.apiKeyId }),
          ...(data.appId !== undefined && { appId: data.appId }),
          ...(data.appVersion !== undefined && { appVersion: data.appVersion }),
          ...(data.attemptsPerSecond !== undefined && {
            attemptsPerSecond: data.attemptsPerSecond,
          }),
          ...(data.gender !== undefined && { gender: data.gender }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.audioUrl !== undefined && { audioUrl: data.audioUrl }),
          ...(data.audioRecordings !== undefined && {
            audioRecordings: data.audioRecordings as unknown as Prisma.InputJsonValue,
          }),
          ...(data.agentVariables !== undefined && {
            agentVariables: data.agentVariables as unknown as Prisma.InputJsonValue,
          }),
          ...(data.welcomeMessage !== undefined && {
            welcomeMessage: data.welcomeMessage as unknown as Prisma.InputJsonValue,
          }),
          ...(data.outputVariables !== undefined && {
            outputVariables: data.outputVariables as unknown as Prisma.InputJsonValue,
          }),
          ...(data.connectionConfigs !== undefined && {
            connectionConfigs: data.connectionConfigs as unknown as Prisma.InputJsonValue,
          }),
          ...(data.retryConfig !== undefined && {
            retryConfig: data.retryConfig as unknown as Prisma.InputJsonValue,
          }),
          ...(data.allowedSchedule !== undefined && {
            allowedSchedule: data.allowedSchedule as unknown as Prisma.InputJsonValue,
          }),
          ...(data.allowTenantVisible !== undefined && {
            allowTenantVisible: data.allowTenantVisible,
          }),
          ...(data.status !== undefined && { status: data.status }),
        },
        include: this.agentWithApiKeyInclude,
      });
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
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.SarvamAgentWhereInput = {};

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.apiKeyId) {
      where.apiKeyId = filter.apiKeyId;
    }

    if (filter.tenantId) {
      where.apiKey = {
        tenantId: filter.tenantId,
      };
    }

    if (filter.search) {
      const search = filter.search;
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { appId: { contains: search, mode: "insensitive" } },
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
      data: { status: "ARCHIVED" },
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
        OR: [
          { allowTenantVisible: true },
          {
            apiKey: {
              tenantId,
              isActive: true,
            },
          },
        ],
      },
      orderBy: { name: "asc" },
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
        OR: [
          { allowTenantVisible: true },
          {
            apiKey: {
              tenantId,
              isActive: true,
            },
          },
        ],
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

  async hasDependentRecords(id: string): Promise<{
    hasDependents: boolean;
    campaignCount: number;
    callCount: number;
  }> {
    const [campaignCount, callCount] = await Promise.all([
      prisma.campaign.count({ where: { sarvamAgentId: id } }),
      prisma.call.count({ where: { sarvamAgentId: id } }),
    ]);
    return {
      hasDependents: campaignCount > 0 || callCount > 0,
      campaignCount,
      callCount,
    };
  }

  async cloneWithNewApiKey(
    sourceAgentId: string,
    data: CreateSarvamAgentRecord,
  ): Promise<SarvamAgentWithApiKeyAndTenant> {
    try {
      return await prisma.$transaction(async (tx) => {
        const newAgent = await tx.sarvamAgent.create({
          data: {
            name: data.name,
            apiKeyId: data.apiKeyId,
            appId: data.appId,
            appVersion: data.appVersion,
            attemptsPerSecond: data.attemptsPerSecond,
            gender: data.gender ?? null,
            type: data.type ?? "OUTBOUND",
            audioUrl: data.audioUrl ?? (data.audioRecordings?.[0]?.audioUrl ?? null),
            audioRecordings: (data.audioRecordings ?? []) as unknown as Prisma.InputJsonValue,
            agentVariables: data.agentVariables as unknown as Prisma.InputJsonValue,
            welcomeMessage: data.welcomeMessage as unknown as Prisma.InputJsonValue,
            outputVariables: data.outputVariables as unknown as Prisma.InputJsonValue,
            connectionConfigs: data.connectionConfigs as unknown as Prisma.InputJsonValue,
            retryConfig: data.retryConfig as unknown as Prisma.InputJsonValue,
            ...(data.allowedSchedule !== undefined && {
              allowedSchedule: data.allowedSchedule as unknown as Prisma.InputJsonValue,
            }),
            allowTenantVisible: data.allowTenantVisible ?? false,
            status: data.status ?? "ACTIVE",
            createdBy: data.createdBy,
            ...(data.goals && data.goals.length > 0 && {
              goals: {
                create: data.goals.map((g) => ({
                  outputVariableName: g.outputVariableName,
                  expectedValue: g.expectedValue,
                  displayName: g.displayName,
                })),
              },
            }),
          },
          include: this.agentWithApiKeyInclude,
        });

        const sourceOverrides = await tx.sarvamAgentTenantOverride.findMany({
          where: { agentId: sourceAgentId },
        });

        if (sourceOverrides.length > 0) {
          for (const ov of sourceOverrides) {
            await tx.sarvamAgentTenantOverride.create({
              data: {
                agentId: newAgent.id,
                tenantId: ov.tenantId,
                variableOverrides: ov.variableOverrides as unknown as Prisma.InputJsonValue,
                welcomeMessage: ov.welcomeMessage,
              },
            });
          }
        }

        return newAgent;
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "P2002") {
        throw new SarvamAgentDuplicateAppIdError(data.apiKeyId, data.appId);
      }
      throw err;
    }
  }
}
