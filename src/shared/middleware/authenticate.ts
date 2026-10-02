import type { Request, Response, RequestHandler } from "express";
import type { TokenService } from "../../modules/auth/application/interfaces/token-service.interface";
import type { AuthRepository } from "../../modules/auth/application/interfaces/auth-repository.interface";
import { UnauthorizedError } from "../errors/unauthorized.error";
import { ForbiddenError } from "../errors/forbidden.error";
import { AuthMessages } from "../constants/messages";
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  getCookieSameSite,
} from "../constants/cookies";
import { BEARER_PREFIX, HEADER_AUTHORIZATION } from "../constants/headers";
import { env } from "../config/env";
import type { AuthContext, TenantAuthContext } from "../types";
import type { Logger } from "../logging/logger.interface";

export class AuthenticateMiddleware {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authRepository: AuthRepository,
    private readonly logger?: Logger,
  ) {}

  any(): RequestHandler {
    return async (req, res, next) => {
      try {
        const context = await this.resolveContext(req, res);
        (req as Request & { user: AuthContext }).user = context;
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  tenant(): RequestHandler {
    return async (req, res, next) => {
      try {
        const context = await this.resolveContext(req, res);
        if (context.type !== "tenant") {
          this.logger?.warn("Tenant auth required but non-tenant context", {
            action: "auth.middleware.tenant_required",
            userId: context.userId,
            contextType: context.type,
          });
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
    return async (req, res, next) => {
      try {
        const context = await this.resolveContext(req, res);
        if (!context.isPlatformAdmin) {
          this.logger?.warn(
            "Admin auth required but user is not platform admin",
            {
              action: "auth.middleware.admin_required",
              userId: context.userId,
            },
          );
          throw new ForbiddenError(AuthMessages.NOT_PLATFORM_ADMIN);
        }
        (req as Request & { user: AuthContext }).user = context;
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  private async resolveContext(
    req: Request,
    res: Response,
  ): Promise<AuthContext> {
    let token: string | undefined;

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

    const payload = this.tokenService.verifyAccessToken(token);

    // Single DB query: fetch user & memberships
    const user = await this.authRepository.findUserById(payload.userId);
    if (!user) {
      this.logger?.warn("Token valid but user not found in DB", {
        action: "auth.middleware.user_not_found",
        userId: payload.userId,
      });
      this.clearCookies(res);
      throw new UnauthorizedError(AuthMessages.USER_NOT_FOUND);
    }

    // CRITICAL: Deactivated user must return 401 and wipe cookies
    if (!user.isActive) {
      this.logger?.warn("Deactivated user attempted access", {
        action: "auth.middleware.deactivated_user",
        userId: user.id,
        email: user.email,
      });
      this.clearCookies(res);
      throw new UnauthorizedError(
        "Your account has been deactivated. Please contact support.",
      );
    }

    // Tenant context
    if (payload.type === "tenant" && payload.tenantId) {
      const membership = user.memberships.find(
        (m) => m.tenantId === payload.tenantId,
      );

      if (!membership) {
        this.logger?.warn("Tenant membership not found for user", {
          action: "auth.middleware.membership_not_found",
          userId: user.id,
          tenantId: payload.tenantId,
        });
        throw new UnauthorizedError(AuthMessages.MEMBERSHIP_NOT_FOUND);
      }
      if (!membership.tenantActive) {
        this.logger?.warn("Inactive tenant access attempt", {
          action: "auth.middleware.tenant_inactive",
          userId: user.id,
          tenantId: membership.tenantId,
        });
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

    // Platform admin context
    if (payload.type === "admin" && user.isPlatformAdmin) {
      return {
        type: "admin",
        userId: user.id,
        email: user.email,
        isPlatformAdmin: true,
      };
    }

    return {
      type: "base",
      userId: user.id,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }

  private clearCookies(res: Response): void {
    const isProduction = env.nodeEnv === "production";
    const sameSite = getCookieSameSite(isProduction);
    const opts = { httpOnly: true, secure: isProduction, sameSite, path: "/" };

    res.clearCookie(COOKIE_ACCESS_TOKEN, opts);
    res.clearCookie(COOKIE_REFRESH_TOKEN, opts);
  }
}
