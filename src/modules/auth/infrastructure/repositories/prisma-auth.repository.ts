import prisma from "../../../../shared/config/database/prisma";
import type {
  AuthRepository,
  RegisterTenantOwnerData,
  RegisterMemberData,
  CreateMembershipData,
  SaveRefreshTokenData,
} from "../../application/interfaces/auth-repository.interface";
import type {
  AuthUserEntity,
  AuthMembershipEntity,
} from "../../domain/entities/auth-user.entity";

export class PrismaAuthRepository implements AuthRepository {
  async findUserByEmail(email: string): Promise<AuthUserEntity | null> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        platformAdmin: true,
        memberships: {
          include: { tenant: true },
        },
      },
    });

    if (!user) return null;

    return this.mapToEntity(user);
  }

  async findUserById(userId: string): Promise<AuthUserEntity | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        platformAdmin: true,
        memberships: {
          include: { tenant: true },
        },
      },
    });

    if (!user) return null;

    return this.mapToEntity(user);
  }

  async registerTenantOwner(data: RegisterTenantOwnerData): Promise<{
    user: AuthUserEntity;
    tenantId: string;
    membershipId: string;
  }> {
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: data.tenantName,
          email: data.tenantEmail,
          termsAccepted: data.termsAccepted,
          termsAcceptedAt: data.termsAcceptedAt,
          termsVersion: data.termsVersion,
        },
      });

      const user = await tx.user.create({
        data: {
          email: data.userEmail,
          password: data.passwordHash,
          name: data.userName,
        },
      });

      const membership = await tx.tenantUser.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: "OWNER",
        },
      });

      return { tenant, user, membership };
    });

    const userEntity = await this.findUserById(result.user.id);

    if (!userEntity) {
      throw new Error("Failed to retrieve user after registration");
    }

    return {
      user: userEntity,
      tenantId: result.tenant.id,
      membershipId: result.membership.id,
    };
  }

  async registerMember(
    data: RegisterMemberData,
  ): Promise<{ user: AuthUserEntity; membershipId: string }> {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.userEmail,
          password: data.passwordHash,
          name: data.userName,
        },
      });

      const membership = await tx.tenantUser.create({
        data: {
          userId: user.id,
          tenantId: data.tenantId,
          role: data.role,
        },
        include: { tenant: true },
      });

      return { user, membership };
    });

    const userEntity = await this.findUserById(result.user.id);

    if (!userEntity) {
      throw new Error("Failed to retrieve user after registration");
    }

    return {
      user: userEntity,
      membershipId: result.membership.id,
    };
  }

  async findMembership(
    userId: string,
    tenantId: string,
  ): Promise<AuthMembershipEntity | null> {
    const membership = await prisma.tenantUser.findUnique({
      where: {
        userId_tenantId: { userId, tenantId },
      },
      include: { tenant: true },
    });

    if (!membership) return null;

    return {
      id: membership.id,
      tenantId: membership.tenantId,
      tenantName: membership.tenant.name,
      tenantActive: membership.tenant.isActive,
      role: membership.role,
    };
  }

  async createMembership(
    data: CreateMembershipData,
  ): Promise<AuthMembershipEntity> {
    const membership = await prisma.tenantUser.create({
      data: {
        userId: data.userId,
        tenantId: data.tenantId,
        role: data.role,
      },
      include: { tenant: true },
    });

    return {
      id: membership.id,
      tenantId: membership.tenantId,
      tenantName: membership.tenant.name,
      tenantActive: membership.tenant.isActive,
      role: membership.role,
    };
  }

  async checkMembershipExists(
    userId: string,
    tenantId: string,
  ): Promise<boolean> {
    const count = await prisma.tenantUser.count({
      where: { userId, tenantId },
    });
    return count > 0;
  }

  async checkTenantActive(tenantId: string): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { isActive: true },
    });
    return tenant?.isActive ?? false;
  }

  async saveRefreshToken(data: SaveRefreshTokenData): Promise<string> {
    const token = await prisma.refreshToken.create({
      data: {
        tokenHash: data.tokenHash,
        userId: data.userId,
        familyId: data.familyId,
        expiresAt: data.expiresAt,
      },
    });
    return token.id;
  }

  async findRefreshToken(tokenHash: string): Promise<{
    id: string;
    userId: string;
    familyId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  } | null> {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  
  async cleanupExpiredRefreshTokens(olderThanDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
      },
    });
    return result.count;
  }

  async updateUserPassword(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });
  }

  // ── Private Mappers ──────────────────────────────────────────────────────

  private mapToEntity(user: {
    id: string;
    email: string;
    name: string;
    password: string;
    isActive: boolean; // add this field
    platformAdmin: { id: string } | null;
    memberships: Array<{
      id: string;
      tenantId: string;
      role: string;
      tenant: { name: string; isActive: boolean };
    }>;
  }): AuthUserEntity {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.password,
      isActive: user.isActive, // <-- REQUIRED
      isPlatformAdmin: user.platformAdmin !== null,
      memberships: user.memberships.map((m) => ({
        id: m.id,
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        tenantActive: m.tenant.isActive,
        role: m.role as AuthMembershipEntity["role"],
      })),
    };
  }
}
