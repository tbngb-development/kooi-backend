import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import {
  type TenantTokenContext,
  type TokenService,
} from "../../application/interfaces/token-service.interface";
import {
  type AccessTokenPayload,
  type InviteTokenPayload,
  type RefreshTokenPayload,
} from "../../../../shared/types";
import { env } from "../../../../shared/config/env";
import { type TenantRole } from "@prisma/client";
import { UnauthorizedError } from "../../../../shared/errors";
import { AuthMessages } from "../../../../shared/constants";

export class JwtTokenService implements TokenService {
  generateAccessToken(context: TenantTokenContext): string {
    const payload: AccessTokenPayload = {
      userId: context.userId,
      membershipId: context.membershipId,
      tenantId: context.tenantId,
      tenantRole: context.tenantRole,
      isPlatformAdmin: context.isPlatformAdmin,
      type: "tenant",
    };

    const options: SignOptions = {
      expiresIn: env.jwt.accessExpiry as SignOptions["expiresIn"],
    };

    return jwt.sign(payload, env.jwt.secret, options);
  }

  generateBaseAccessToken(userId: string, isPlatformAdmin: boolean): string {
    const payload: AccessTokenPayload = {
      userId,
      membershipId: null,
      tenantId: null,
      tenantRole: null,
      isPlatformAdmin,
      type: "base",
    };

    const options: SignOptions = {
      expiresIn: env.jwt.accessExpiry as SignOptions["expiresIn"],
    };

    return jwt.sign(payload, env.jwt.secret, options);
  }

  generateAdminAccessToken(userId: string): string {
    const payload: AccessTokenPayload = {
      userId,
      membershipId: null,
      tenantId: null,
      tenantRole: null,
      isPlatformAdmin: true,
      type: "admin",
    };

    const options: SignOptions = {
      expiresIn: env.jwt.accessExpiry as SignOptions["expiresIn"],
    };

    return jwt.sign(payload, env.jwt.secret, options);
  }

  generateRefreshToken(userId: string): {
    rawToken: string;
    tokenHash: string;
    familyId: string;
    expiresIn: number;
  } {
    const rawToken = crypto.randomBytes(64).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const familyId = crypto.randomUUID();

    const expirySeconds = this.parseExpiryToSeconds(env.jwt.refreshExpiry);

    const payload: RefreshTokenPayload = {
      userId,
      tokenId: tokenHash,
      type: "refresh",
    };

    const options: SignOptions = {
      expiresIn: env.jwt.refreshExpiry as SignOptions["expiresIn"],
    };

    const signedToken = jwt.sign(payload, env.jwt.secret, options);

    return {
      rawToken: signedToken,
      tokenHash,
      familyId,
      expiresIn: expirySeconds,
    };
  }

  generateRefreshTokenForFamily(
    userId: string,
    familyId: string,
  ): {
    rawToken: string;
    tokenHash: string;
    familyId: string;
    expiresIn: number;
  } {
    const rawToken = crypto.randomBytes(64).toString("hex");
    const tokenHash = this.hashToken(rawToken);

    const expirySeconds = this.parseExpiryToSeconds(env.jwt.refreshExpiry);

    const payload: RefreshTokenPayload = {
      userId,
      tokenId: tokenHash,
      type: "refresh",
    };

    const options: SignOptions = {
      expiresIn: env.jwt.refreshExpiry as SignOptions["expiresIn"],
    };

    const signedToken = jwt.sign(payload, env.jwt.secret, options);

    return {
      rawToken: signedToken,
      tokenHash,
      familyId, // ← Inherits existing family
      expiresIn: expirySeconds,
    };
  }

  generateInviteToken(
    tenantId: string,
    role: TenantRole,
    email: string,
    inviterId: string,
  ): string {
    const payload: InviteTokenPayload = {
      tenantId,
      role,
      email,
      inviterId,
      type: "invite",
    };

    const options: SignOptions = {
      expiresIn: env.jwt.inviteExpiry as SignOptions["expiresIn"],
    };

    return jwt.sign(payload, env.jwt.secret, options);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return jwt.verify(token, env.jwt.secret) as AccessTokenPayload;
    } catch {
      throw new UnauthorizedError(AuthMessages.INVALID_TOKEN);
    }
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      return jwt.verify(token, env.jwt.secret) as RefreshTokenPayload;
    } catch {
      throw new UnauthorizedError(AuthMessages.REFRESH_TOKEN_INVALID);
    }
  }

  verifyInviteToken(token: string): InviteTokenPayload {
    try {
      return jwt.verify(token, env.jwt.secret) as InviteTokenPayload;
    } catch {
      throw new UnauthorizedError(AuthMessages.INVALID_INVITE);
    }
  }

  hashToken(rawToken: string): string {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 3600;
      case "d":
        return value * 86400;
      default:
        return 900;
    }
  }
}
