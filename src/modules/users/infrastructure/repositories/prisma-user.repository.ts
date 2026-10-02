import { type TenantRole } from "@prisma/client";
import prisma from "../../../../shared/config/database/prisma";
import {
  type CreateUserData,
  type UpdateUserData,
  type UserRepository,
} from "../../application/interfaces/user-repository.interface";
import { type TenantMemberData } from "../../domain/entities/tenant-member.entity";

export class PrismaUserRepository implements UserRepository {
  async list(tenantId: string): Promise<TenantMemberData[]> {
    const memberships = await prisma.tenantUser.findMany({
      where: { tenantId },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    return memberships.map((m) => ({
      id: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role as TenantRole,
      createdAt: m.createdAt,
    }));
  }

  async findById(
    tenantId: string,
    userId: string,
  ): Promise<TenantMemberData | null> {
    const membership = await prisma.tenantUser.findFirst({
      where: { tenantId, userId },
      include: { user: true },
    });

    if (!membership) return null;

    return {
      id: membership.userId,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role as TenantRole,
      createdAt: membership.createdAt,
    };
  }

  async findByEmail(email: string): Promise<boolean> {
    const count = await prisma.user.count({ where: { email } });
    return count > 0;
  }

  async create(
    tenantId: string,
    data: CreateUserData,
  ): Promise<TenantMemberData> {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          password: data.passwordHash,
        },
      });

      const membership = await tx.tenantUser.create({
        data: {
          userId: user.id,
          tenantId,
          role: data.role,
        },
      });

      return { user, membership };
    });

    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.membership.role as TenantRole,
      createdAt: result.membership.createdAt,
    };
  }

  async update(
    tenantId: string,
    userId: string,
    data: UpdateUserData,
  ): Promise<TenantMemberData> {
    const result = await prisma.$transaction(async (tx) => {
      if (data.name) {
        await tx.user.update({
          where: { id: userId },
          data: { name: data.name },
        });
      }

      const membership = await tx.tenantUser.update({
        where: { userId_tenantId: { userId, tenantId } },
        data: {
          ...(data.role && { role: data.role }),
        },
        include: { user: true },
      });

      return membership;
    });

    return {
      id: result.userId,
      email: result.user.email,
      name: result.user.name,
      role: result.role as TenantRole,
      createdAt: result.createdAt,
    };
  }

  async delete(tenantId: string, userId: string): Promise<void> {
    // Standard cleanup removes membership & cascade cascade checks
    await prisma.tenantUser.delete({
      where: { userId_tenantId: { userId, tenantId } },
    });
  }
}
