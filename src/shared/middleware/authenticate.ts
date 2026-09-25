import type { Request, RequestHandler } from "express";
import type { TokenService } from "../../modules/auth/application/interfaces/token-service.interface";
import type { AuthRepository } from "../../modules/auth/application/interfaces/auth-repository.interface";
import { UnauthorizedError } from "../errors/unauthorized.error";
import { ForbiddenError } from "../errors/forbidden.error";
import { AuthMessages } from "../constants/messages";
import { COOKIE_ACCESS_TOKEN } from "../constants/cookies";
import { BEARER_PREFIX, HEADER_AUTHORIZATION } from "../constants/headers";
import type { AuthContext, TenantAuthContext } from "../types";

export class AuthenticateMiddleware {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authRepository: AuthRepository,
  ) {}

  any(): RequestHandler {
    return async (req, _res, next) => {
      try {
        const context = await this.resolveContext(req);
        (req as Request & { user: AuthContext }).user = context;
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  tenant(): RequestHandler {
    return async (req, _res, next) => {
      try {
        const context = await this.resolveContext(req);
        if (context.type !== "tenant") {
          throw new ForbiddenError(AuthMessages.MULTIPLE_TENANTS);
        }
        (req as Request & { user: TenantAuthContext }).user = context;
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  admin(): RequestHandler {
    return async (req, _res, next) => {
      try {
        const context = await this.resolveContext(req);
        if (!context.isPlatformAdmin) {
          throw new ForbiddenError(AuthMessages.NOT_PLATFORM_ADMIN);
        }
        (req as Request & { user: AuthContext }).user = context;
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  private async resolveContext(req: Request): Promise<AuthContext> {
    let token: string | undefined;

    // 1. Extract token from Cookie or Bearer Header
    if (req.cookies?.[COOKIE_ACCESS_TOKEN]) {
      token = req.cookies[COOKIE_ACCESS_TOKEN] as string;
    }

    if (!token) {
      const authHeader = req.headers[HEADER_AUTHORIZATION];
      if (
        typeof authHeader === "string" &&
        authHeader.startsWith(BEARER_PREFIX)
      ) {
        token = authHeader.slice(BEARER_PREFIX.length);
      }
    }

    if (!token) {
      throw new UnauthorizedError(AuthMessages.TOKEN_NOT_PROVIDED);
    }

    // 2. Cryptographically verify JWT signature & expiration
    const payload = this.tokenService.verifyAccessToken(token);

    // 3. SINGLE DB QUERY: Fetch user and all memberships
    const user = await this.authRepository.findUserById(payload.userId);
    if (!user) {
      throw new UnauthorizedError(AuthMessages.USER_NOT_FOUND);
    }

    // Security Check: Deactivated users fail immediately
    if (!user.isActive) {
      throw new ForbiddenError("Your account has been deactivated.");
    }

    // 4. TENANT SCOPE: Resolved 100% IN-MEMORY (0 extra DB queries)
    if (payload.type === "tenant" && payload.tenantId) {
      const membership = user.memberships.find(
        (m) => m.tenantId === payload.tenantId,
      );

      if (!membership) {
        throw new UnauthorizedError(AuthMessages.MEMBERSHIP_NOT_FOUND);
      }
      if (!membership.tenantActive) {
        throw new ForbiddenError(AuthMessages.TENANT_INACTIVE);
      }

      return {
        type: "tenant",
        userId: user.id,
        email: user.email,
        membershipId: membership.id,
        tenantId: membership.tenantId,
        tenantRole: membership.role,
        isPlatformAdmin: user.isPlatformAdmin,
      };
    }

    // 5. PLATFORM ADMIN SCOPE: Verified against fresh DB user
    if (payload.type === "admin" && user.isPlatformAdmin) {
      return {
        type: "admin",
        userId: user.id,
        email: user.email,
        isPlatformAdmin: true,
      };
    }

    // 6. BASE (UNSCOPED) CONTEXT
    return {
      type: "base",
      userId: user.id,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }
}
