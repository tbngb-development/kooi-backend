import type { BolnaApiKey, BolnaApiKeyType, Prisma } from "@prisma/client";
import prisma from "../../../../shared/config/database/prisma";
import type {
  BolnaApiKeyRepository,
  CreateBolnaApiKeyData,
  BolnaApiKeyWithCount,
} from "../../application/interfaces/bolna-api-key-repository.interface";
import { NoAvailableApiKeyError } from "../../domain/errors/bolna-api-key.errors";

export class PrismaBolnaApiKeyRepository implements BolnaApiKeyRepository {
  // ── Runtime resolution ─────────────────────────────────────────

  async findKeyForTenant(
    tenantId?: string | null,
  ): Promise<BolnaApiKey | null> {
    // 1. If called in Admin scope or without a tenantId, use the platform default key
    if (!tenantId) {
      return prisma.bolnaApiKey.findFirst({
        where: { isPlatformDefault: true, isActive: true },
      });
    }

    // 2. Fetch assigned key for tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { bolnaApiKey: true },
    });

    if (tenant?.bolnaApiKey && tenant.bolnaApiKey.isActive) {
      return tenant.bolnaApiKey;
    }

    // 3. Fallback to platform default key if tenant has no key assigned yet
    return prisma.bolnaApiKey.findFirst({
      where: { isPlatformDefault: true, isActive: true },
    });
  }

  async updateLastAccessed(keyId: string): Promise<void> {
    await prisma.bolnaApiKey.update({
      where: { id: keyId },
      data: { lastAccessedAt: new Date() },
    });
  }

  // ── Assignment ────────────────────────────────────────────────

  async assignLeastLoadedKeyToTenant(tenantId: string): Promise<BolnaApiKey> {
    const leastLoadedKey = await prisma.bolnaApiKey.findFirst({
      where: { type: "GENERAL", isActive: true },
      orderBy: { tenants: { _count: "asc" } },
    });

    if (!leastLoadedKey) throw new NoAvailableApiKeyError();

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { bolnaApiKeyId: leastLoadedKey.id },
    });

    return leastLoadedKey;
  }

  async assignKeyToTenant(tenantId: string, keyId: string): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { bolnaApiKeyId: keyId },
    });
  }

  // ── Admin CRUD ────────────────────────────────────────────────

  async create(data: CreateBolnaApiKeyData): Promise<BolnaApiKey> {
    return prisma.bolnaApiKey.create({
      data: {
        keyIdentifier: data.keyIdentifier,
        encryptedKey: data.encryptedKey,
        type: data.type,
        isPlatformDefault: data.isPlatformDefault,
        createdBy: data.createdBy,
      },
    });
  }

  async list(): Promise<BolnaApiKeyWithCount[]> {
    return prisma.bolnaApiKey.findMany({
      include: { _count: { select: { tenants: true } } },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
  }

  async findById(id: string): Promise<BolnaApiKey | null> {
    return prisma.bolnaApiKey.findUnique({ where: { id } });
  }

  async deactivate(id: string): Promise<BolnaApiKey> {
    return prisma.bolnaApiKey.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ── Profile management ─────────────────────────────────

  async updateProfile(
    keyId: string,
    profile: {
      bolnaProfileName: string | null;
      bolnaProfileEmail: string | null;
      bolnaWalletBalance: number | null;
      bolnaConcurrencyMax: number | null;
      bolnaConcurrencyCurrent: number | null;
      bolnaProfileFetchedAt: Date;
    },
  ): Promise<void> {
    await prisma.bolnaApiKey.update({
      where: { id: keyId },
      data: profile,
    });
  }

  // ── Key metadata update ────────────────────────────────

  async updateKey(
    keyId: string,
    data: {
      keyIdentifier?: string;
      encryptedKey?: string;
      type?: BolnaApiKeyType;
    },
  ): Promise<void> {
    await prisma.bolnaApiKey.update({
      where: { id: keyId },
      data,
    });
  }

  // ── Lifecycle ──────────────────────────────────────────

  async activate(keyId: string): Promise<void> {
    await prisma.bolnaApiKey.update({
      where: { id: keyId },
      data: { isActive: true },
    });
  }

  // ── Tenant listing ─────────────────────────────────────

  async listTenantsForKey(
    keyId: string,
    options: { page: number; limit: number; search?: string },
  ): Promise<{
    tenants: Array<{
      id: string;
      name: string;
      email: string;
      isActive: boolean;
      workspaceSwitchStatus: string;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, search } = options;
    const skip = (page - 1) * limit;

    const where: Prisma.TenantWhereInput = {
      bolnaApiKeyId: keyId,
    };

    if (search && search.trim().length > 0) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { email: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          workspaceSwitchStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.tenant.count({ where }),
    ]);

    return {
      tenants,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async reassignTenantsFromKey(keyId: string): Promise<number> {
    const affectedTenants = await prisma.tenant.findMany({
      where: { bolnaApiKeyId: keyId },
      select: { id: true },
    });

    if (affectedTenants.length === 0) return 0;

    let reassignedCount = 0;
    for (const tenant of affectedTenants) {
      try {
        await this.assignLeastLoadedKeyToTenant(tenant.id);
        reassignedCount++;
      } catch {
        // Skip if no other pool key available
      }
    }

    return reassignedCount;
  }

  async findTenantIdsUsingKey(keyId: string): Promise<string[]> {
    const tenants = await prisma.tenant.findMany({
      where: { bolnaApiKeyId: keyId },
      select: { id: true },
    });
    return tenants.map((t) => t.id);
  }
}
