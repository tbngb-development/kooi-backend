import type { TenantRole } from "@prisma/client";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  InviteTokenPayload,
} from "../../../../shared/types";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

export interface TenantTokenContext {
  userId: string;
  membershipId: string;
  tenantId: string;
  tenantRole: TenantRole;
  isPlatformAdmin: boolean;
}

export interface TokenService {
  generateAccessToken(context: TenantTokenContext): string;
  generateBaseAccessToken(userId: string, isPlatformAdmin: boolean): string;
  generateAdminAccessToken(userId: string): string;
  generateRefreshToken(userId: string): {
    rawToken: string;
    tokenHash: string;
    familyId: string;
    expiresIn: number;
  };

  generateRefreshTokenForFamily(
    userId: string,
    familyId: string,
  ): {
    rawToken: string;
    tokenHash: string;
    familyId: string;
    expiresIn: number;
  };

  generateInviteToken(
    tenantId: string,
    role: TenantRole,
    email: string,
    inviterId: string,
  ): string;

  verifyAccessToken(token: string): AccessTokenPayload;
  verifyRefreshToken(token: string): RefreshTokenPayload;
  verifyInviteToken(token: string): InviteTokenPayload;

  hashToken(rawToken: string): string;
}
