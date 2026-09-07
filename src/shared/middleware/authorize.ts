import type { RequestHandler } from "express";
import type { TenantRole } from "@prisma/client";
import { ForbiddenError } from "../errors/forbidden.error";
import { UnauthorizedError } from "../errors/unauthorized.error";
import type { AuthRequest, TenantAuthContext } from "../types";

export class AuthorizeMiddleware {
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
        return next(new ForbiddenError());
      }

      const tenantCtx = ctx as TenantAuthContext;
      if (!allowed.includes(tenantCtx.tenantRole)) {
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
        return next(new ForbiddenError());
      }

      next();
    };
  }
}