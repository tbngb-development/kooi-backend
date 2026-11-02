import type { Prisma } from "@prisma/client";
import prisma from "../../../../shared/config/database/prisma";
import type {
  ISarvamApiKeyRepository,
  CreateSarvamApiKeyRecord,
  UpdateSarvamApiKeyRecord,
  ListSarvamApiKeyFilter,
  SarvamApiKeyWithTenant,
} from "../../application/interfaces/sarvam-api-key-repository.interface";

export class PrismaSarvamApiKeyRepository implements ISarvamApiKeyRepository {
  private readonly tenantSelect = {
    id: true,
    name: true,
    email: true,
    isActive: true,
  } as const;

  async create(
    data: CreateSarvamApiKeyRecord,
  ): Promise<SarvamApiKeyWithTenant> {
    return prisma.sarvamApiKey.create({
      data: {
        tenantId: data.tenantId,
        apiKeyEncrypted: data.apiKeyEncrypted,
        workspaceId: data.workspaceId,
        organizationId: data.organizationId,
        isActive: data.isActive ?? true,
        createdBy: data.createdBy,
      },
      include: {
        tenant: {
          select: this.tenantSelect,
        },
      },
    });
  }

  async update(
    id: string,
    data: UpdateSarvamApiKeyRecord,
  ): Promise<SarvamApiKeyWithTenant> {
    return prisma.sarvamApiKey.update({
      where: { id },
      data: {
        ...(data.apiKeyEncrypted !== undefined && {
          apiKeyEncrypted: data.apiKeyEncrypted,
        }),
        ...(data.workspaceId !== undefined && {
          workspaceId: data.workspaceId,
        }),
        ...(data.organizationId !== undefined && {
          organizationId: data.organizationId,
        }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        updatedBy: data.updatedBy,
      },
      include: {
        tenant: {
          select: this.tenantSelect,
        },
      },
    });
  }

  async findById(id: string): Promise<SarvamApiKeyWithTenant | null> {
    return prisma.sarvamApiKey.findUnique({
      where: { id },
      include: {
        tenant: {
          select: this.tenantSelect,
        },
      },
    });
  }

  async findByTenantId(
    tenantId: string,
  ): Promise<SarvamApiKeyWithTenant | null> {
    return prisma.sarvamApiKey.findUnique({
      where: { tenantId },
      include: {
        tenant: {
          select: this.tenantSelect,
        },
      },
    });
  }

  async list(filter: ListSarvamApiKeyFilter): Promise<{
    items: SarvamApiKeyWithTenant[];
    total: number;
  }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.max(1, Math.min(100, filter.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: Prisma.SarvamApiKeyWhereInput = {};

    if (filter.tenantId) {
      where.tenantId = filter.tenantId;
    }

    if (filter.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    if (filter.search && filter.search.trim().length > 0) {
      const search = filter.search.trim();
      where.OR = [
        { workspaceId: { contains: search, mode: "insensitive" } },
        { organizationId: { contains: search, mode: "insensitive" } },
        {
          tenant: {
            name: { contains: search, mode: "insensitive" },
          },
        },
        {
          tenant: {
            email: { contains: search, mode: "insensitive" },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.sarvamApiKey.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          tenant: {
            select: this.tenantSelect,
          },
        },
      }),
      prisma.sarvamApiKey.count({ where }),
    ]);

    return { items, total };
  }

  async delete(id: string): Promise<void> {
    await prisma.sarvamApiKey.delete({
      where: { id },
    });
  }

  async existsForTenant(tenantId: string): Promise<boolean> {
    const count = await prisma.sarvamApiKey.count({
      where: { tenantId },
    });
    return count > 0;
  }

  async tenantExists(tenantId: string): Promise<boolean> {
    const count = await prisma.tenant.count({
      where: { id: tenantId },
    });
    return count > 0;
  }
}

