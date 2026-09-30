import type { RequestHandler } from "express";
import type { TenantRole } from "@prisma/client";
import { ForbiddenError } from "../errors/forbidden.error";
import { UnauthorizedError } from "../errors/unauthorized.error";
import type { AuthRequest, TenantAuthContext } from "../types";
import type { Logger } from "../logging/logger.interface";

export class AuthorizeMiddleware {
  constructor(private readonly logger?: Logger) {}

  /**
   * Require the tenant user to have one of the given tenant roles.
   */
  tenantRoles(...allowed: TenantRole[]): RequestHandler {
    return (req, _res, next) => {
      const authReq = req as AuthRequest;
      const ctx = authReq.user;

      if (!ctx) {
        return next(new UnauthorizedError());
      }
      if (ctx.type !== "tenant") {
        this.logger?.warn("Authorization denied — non-tenant context", {
          action: "auth.authorize.denied",
          userId: ctx.userId,
          contextType: ctx.type,
          requiredRoles: allowed,
        });
        return next(new ForbiddenError());
      }

      const tenantCtx = ctx as TenantAuthContext;
      if (!allowed.includes(tenantCtx.tenantRole)) {
        this.logger?.warn("Authorization denied — insufficient role", {
          action: "auth.authorize.role_denied",
          userId: ctx.userId,
          tenantId: tenantCtx.tenantId,
          currentRole: tenantCtx.tenantRole,
          requiredRoles: allowed,
        });
        return next(new ForbiddenError());
      }

      next();
    };
  }

  /**
   * Require the caller to be a platform admin.
   */
  platformAdmin(): RequestHandler {
    return (req, _res, next) => {
      const authReq = req as AuthRequest;
      const ctx = authReq.user;

      if (!ctx) {
        return next(new UnauthorizedError());
      }
      if (!ctx.isPlatformAdmin) {
        this.logger?.warn("Platform admin authorization denied", {
          action: "auth.authorize.admin_denied",
          userId: ctx.userId,
        });
        return next(new ForbiddenError());
      }

      next();
    };
  }
}
