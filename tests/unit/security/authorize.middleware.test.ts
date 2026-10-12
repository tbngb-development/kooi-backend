import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { AuthorizeMiddleware } from "../../../src/shared/middleware/authorize";
import { UnauthorizedError } from "../../../src/shared/errors/unauthorized.error";
import { ForbiddenError } from "../../../src/shared/errors/forbidden.error";

describe("AuthorizeMiddleware (Module 3 - Role-Based Access Control)", () => {
  let authorize: AuthorizeMiddleware;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    authorize = new AuthorizeMiddleware();
    req = {};
    res = {};
    next = vi.fn();
  });

  describe("tenantRoles authorization guard", () => {
    it("rejects unauthenticated request with UnauthorizedError (401)", () => {
      req = { user: undefined };

      const handler = authorize.tenantRoles("OWNER", "ADMIN");
      handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it("rejects non-tenant context with ForbiddenError (403)", () => {
      req = {
        user: {
          type: "base",
          userId: "user-1",
          email: "user@test.com",
          isPlatformAdmin: false,
        },
      } as any;

      const handler = authorize.tenantRoles("OWNER", "ADMIN");
      handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it("rejects tenant user with insufficient role with ForbiddenError (403)", () => {
      req = {
        user: {
          type: "tenant",
          userId: "user-1",
          email: "user@test.com",
          membershipId: "m-1",
          tenantId: "tenant-1",
          tenantRole: "USER", // Only USER, but OWNER/ADMIN required
          isPlatformAdmin: false,
        },
      } as any;

      const handler = authorize.tenantRoles("OWNER", "ADMIN");
      handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it("allows tenant user whose role is in the allowed list", () => {
      req = {
        user: {
          type: "tenant",
          userId: "user-1",
          email: "admin@test.com",
          membershipId: "m-1",
          tenantId: "tenant-1",
          tenantRole: "ADMIN",
          isPlatformAdmin: false,
        },
      } as any;

      const handler = authorize.tenantRoles("OWNER", "ADMIN");
      handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("allows tenant OWNER when OWNER is specified", () => {
      req = {
        user: {
          type: "tenant",
          userId: "user-1",
          email: "owner@test.com",
          membershipId: "m-1",
          tenantId: "tenant-1",
          tenantRole: "OWNER",
          isPlatformAdmin: false,
        },
      } as any;

      const handler = authorize.tenantRoles("OWNER");
      handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("platformAdmin authorization guard", () => {
    it("rejects unauthenticated request with UnauthorizedError (401)", () => {
      req = { user: undefined };

      const handler = authorize.platformAdmin();
      handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it("rejects authenticated user who is not platform admin with ForbiddenError (403)", () => {
      req = {
        user: {
          type: "tenant",
          userId: "owner-id",
          email: "owner@tenant.com",
          membershipId: "m-1",
          tenantId: "tenant-1",
          tenantRole: "OWNER",
          isPlatformAdmin: false, // NOT PLATFORM ADMIN
        },
      } as any;

      const handler = authorize.platformAdmin();
      handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it("allows platform admin user with next()", () => {
      req = {
        user: {
          type: "admin",
          userId: "superadmin-id",
          email: "admin@platform.com",
          isPlatformAdmin: true,
        },
      } as any;

      const handler = authorize.platformAdmin();
      handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
    });
  });
});
