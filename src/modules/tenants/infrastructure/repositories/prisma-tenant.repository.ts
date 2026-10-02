import prisma from "../../../../shared/config/database/prisma";
import type {
  TenantRepository,
  TenantWithCounts,
  TenantStatsResult,
} from "../../application/interfaces/tenant-repository.interface";
import type { TenantEntityData } from "../../domain/tenant.entity";

export class PrismaTenantRepository implements TenantRepository {
  async list(): Promise<TenantWithCounts[]> {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            memberships: true,
            campaigns: true,
            leads: true,
            calls: true,
          },
        },
      },
    });

    return tenants as unknown as TenantWithCounts[];
  }

  async findById(id: string): Promise<TenantWithCounts | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            memberships: true,
            campaigns: true,
            leads: true,
            calls: true,
          },
        },
      },
    });

    return tenant as unknown as TenantWithCounts;
  }

  async update(
    id: string,
    data: { name?: string; isActive?: boolean },
  ): Promise<TenantEntityData> {
    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(typeof data.isActive === "boolean" && { isActive: data.isActive }),
      },
    });

    return updated;
  }

  async getStats(id: string): Promise<TenantStatsResult> {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new Error("Tenant not found");

    const [
      totalUsers,
      totalLeads,
      totalCalls,
      completedCalls,
      activeCampaigns,
    ] = await prisma.$transaction([
      prisma.tenantUser.count({
        where: { tenantId: id },
      }),
      prisma.lead.count({
        where: { tenantId: id },
      }),
      prisma.call.count({
        where: { tenantId: id },
      }),
      prisma.call.count({
        where: {
          tenantId: id,
          status: "COMPLETED",
        },
      }),
      prisma.campaign.count({
        where: {
          tenantId: id,
          status: "RUNNING",
        },
      }),
    ]);

    return {
      tenant,
      stats: {
        totalUsers,
        totalLeads,
        totalCalls,
        completedCalls,
        activeCampaigns,
      },
    };
  }
}
