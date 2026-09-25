import type { TenantRole } from "@prisma/client";
import type {
  AuthUserEntity,
  AuthMembershipEntity,
} from "../../domain/entities/auth-user.entity";

export interface RegisterTenantOwnerData {
  tenantName: string;
  tenantEmail: string;
  userEmail: string;
  userName: string;
  termsAccepted: boolean;
  termsAcceptedAt: Date;
  termsVersion: string;
  passwordHash: string;
}

export interface RegisterMemberData {
  userEmail: string;
  userName: string;
  passwordHash: string;
  tenantId: string;
  role: TenantRole;
}

export interface CreateMembershipData {
  userId: string;
  tenantId: string;
  role: TenantRole;
}

export interface SaveRefreshTokenData {
  tokenHash: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
}

export interface AuthRepository {
  // User queries
  findUserByEmail(email: string): Promise<AuthUserEntity | null>;
  findUserById(userId: string): Promise<AuthUserEntity | null>;

  // Registration
  registerTenantOwner(
    data: RegisterTenantOwnerData,
  ): Promise<{ user: AuthUserEntity; tenantId: string; membershipId: string }>;
  registerMember(
    data: RegisterMemberData,
  ): Promise<{ user: AuthUserEntity; membershipId: string }>;

  // Membership
  findMembership(
    userId: string,
    tenantId: string,
  ): Promise<AuthMembershipEntity | null>;
  createMembership(data: CreateMembershipData): Promise<AuthMembershipEntity>;
  checkMembershipExists(userId: string, tenantId: string): Promise<boolean>;

  // Tenant
  checkTenantActive(tenantId: string): Promise<boolean>;

  // Refresh tokens
  saveRefreshToken(data: SaveRefreshTokenData): Promise<string>;

  findRefreshToken(tokenHash: string): Promise<{
    id: string;
    userId: string;
    familyId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  } | null>;
  revokeRefreshToken(tokenId: string): Promise<void>;

  revokeRefreshTokenFamily(familyId: string): Promise<void>;

  revokeAllUserRefreshTokens(userId: string): Promise<void>;

  cleanupExpiredRefreshTokens(olderThanDays: number): Promise<number>;

  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
}
