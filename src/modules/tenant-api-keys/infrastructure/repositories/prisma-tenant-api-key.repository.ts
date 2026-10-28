import prisma from "../../../../shared/config/database/prisma";
import type { TenantApiKeyEntity } from "../../domain/entities/tenant-api-key.entity";
import type {
  CreateTenantApiKeyInput,
  ITenantApiKeyRepository,
} from "../../application/interfaces/tenant-api-key-repository.interface";

const defaultIncludes = {
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  tenant: {
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  },
} as const;

export class PrismaTenantApiKeyRepository implements ITenantApiKeyRepository {
  async create(input: CreateTenantApiKeyInput): Promise<TenantApiKeyEntity> {
    const record = await prisma.tenantApiKey.create({
      data: {
        keyIdentifier: input.keyIdentifier,
        secretHash: input.secretHash,
        tenantId: input.tenantId,
        createdBy: input.createdBy,
      },
      include: defaultIncludes,
    });

    return record as TenantApiKeyEntity;
  }

  async findByKeyIdentifier(keyIdentifier: string): Promise<TenantApiKeyEntity | null> {
    const record = await prisma.tenantApiKey.findUnique({
      where: { keyIdentifier },
      include: defaultIncludes,
    });

    return record as TenantApiKeyEntity | null;
  }

  async findByIdAndTenantId(id: string, tenantId: string): Promise<TenantApiKeyEntity | null> {
    const record = await prisma.tenantApiKey.findFirst({
      where: {
        id,
        tenantId,
      },
      include: defaultIncludes,
    });

    return record as TenantApiKeyEntity | null;
  }

  async listByTenantId(
    tenantId: string,
    page: number,
    limit: number,
  ): Promise<{ items: TenantApiKeyEntity[]; total: number }> {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.tenantApiKey.findMany({
        where: { tenantId },
        include: defaultIncludes,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.tenantApiKey.count({
        where: { tenantId },
      }),
    ]);

    return {
      items: items as TenantApiKeyEntity[],
      total,
    };
  }

  async deleteByIdAndTenantId(id: string, tenantId: string): Promise<boolean> {
    const result = await prisma.tenantApiKey.deleteMany({
      where: {
        id,
        tenantId,
      },
    });

    return result.count > 0;
  }

  async updateLastAccessedAt(id: string, timestamp: Date): Promise<void> {
    await prisma.tenantApiKey.update({
      where: { id },
      data: { lastAccessedAt: timestamp },
    });
  }
}
