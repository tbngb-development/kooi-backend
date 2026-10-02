import prisma from "../../../../shared/config/database/prisma";
import { NotFoundError } from "../../../../shared/errors/not-found.error";

export class ListAdminUsersUseCase {
  async execute(filters: {
    tenantId?: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    const skip = (filters.page - 1) * filters.limit;

    const where: any = {};
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    if (filters.tenantId) {
      where.memberships = { some: { tenantId: filters.tenantId } };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: { createdAt: "desc" },
        include: {
          memberships: { include: { tenant: { select: { name: true } } } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
        memberships: u.memberships.map((m) => ({
          tenantId: m.tenantId,
          tenantName: m.tenant.name,
          role: m.role,
        })),
      })),
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }
}

export class DeactivateUserUseCase {
  async execute(userId: string, isActive: boolean) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User");

    // If deactivating, also revoke refresh tokens to force immediate logout
    if (!isActive) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive },
    });

    return { success: true, isActive };
  }
}
