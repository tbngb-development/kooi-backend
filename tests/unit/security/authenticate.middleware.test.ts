import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { AuthenticateMiddleware } from "../../../src/shared/middleware/authenticate";
import type { TokenService } from "../../../src/modules/auth/application/interfaces/token-service.interface";
import type { AuthRepository } from "../../../src/modules/auth/application/interfaces/auth-repository.interface";
import { UnauthorizedError } from "../../../src/shared/errors/unauthorized.error";
import { ForbiddenError } from "../../../src/shared/errors/forbidden.error";
import { COOKIE_ACCESS_TOKEN, COOKIE_REFRESH_TOKEN } from "../../../src/shared/constants/cookies";

describe("AuthenticateMiddleware (Module 3 - Authentication & Context Resolution)", () => {
  let tokenService: TokenService;
  let authRepository: AuthRepository;
  let middleware: AuthenticateMiddleware;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    tokenService = {
      generateTokens: vi.fn(),
      verifyAccessToken: vi.fn(),
      verifyRefreshToken: vi.fn(),
    } as unknown as TokenService;

    authRepository = {
      findUserById: vi.fn(),
      findUserByEmail: vi.fn(),
      createTenantOwner: vi.fn(),
      findMembership: vi.fn(),
    } as unknown as AuthRepository;

    middleware = new AuthenticateMiddleware(tokenService, authRepository);

    req = {
      cookies: {},
      headers: {},
    };

    res = {
      clearCookie: vi.fn(),
    };

    next = vi.fn();
  });

  describe("Token Extraction & Validation", () => {
    it("extracts access token from httpOnly cookie", async () => {
      req.cookies = { [COOKIE_ACCESS_TOKEN]: "valid-cookie-token" };

      vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
        userId: "user-1",
        type: "base",
      });

      vi.mocked(authRepository.findUserById).mockResolvedValue({
        id: "user-1",
        email: "user@test.com",
        isActive: true,
        isPlatformAdmin: false,
        memberships: [],
      });

      const handler = middleware.any();
      await handler(req as Request, res as Response, next);

      expect(tokenService.verifyAccessToken).toHaveBeenCalledWith("valid-cookie-token");
      expect(next).toHaveBeenCalledWith();
      expect((req as any).user).toEqual({
        type: "base",
        userId: "user-1",
        email: "user@test.com",
        isPlatformAdmin: false,
      });
    });

    it("extracts token from Authorization: Bearer header when cookie is missing", async () => {
      req.headers = { authorization: "Bearer header-token-xyz" };

      vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
        userId: "user-1",
        type: "base",
      });

      vi.mocked(authRepository.findUserById).mockResolvedValue({
        id: "user-1",
        email: "user@test.com",
        isActive: true,
        isPlatformAdmin: false,
        memberships: [],
      });

      const handler = middleware.any();
      await handler(req as Request, res as Response, next);

      expect(tokenService.verifyAccessToken).toHaveBeenCalledWith("header-token-xyz");
      expect(next).toHaveBeenCalledWith();
    });

    it("passes UnauthorizedError to next() when token is missing completely", async () => {
      const handler = middleware.any();
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      const err = vi.mocked(next).mock.calls[0][0] as UnauthorizedError;
      expect(err.statusCode).toBe(401);
    });

    it("passes UnauthorizedError to next() when token signature is invalid or expired", async () => {
      req.cookies = { [COOKIE_ACCESS_TOKEN]: "bad-token" };
      vi.mocked(tokenService.verifyAccessToken).mockImplementation(() => {
        throw new UnauthorizedError("Token expired");
      });

      const handler = middleware.any();
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it("wipes cookies and returns 401 when user is not found in database", async () => {
      req.cookies = { [COOKIE_ACCESS_TOKEN]: "token-of-deleted-user" };

      vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
        userId: "deleted-user-id",
        type: "base",
      });

      vi.mocked(authRepository.findUserById).mockResolvedValue(null);

      const handler = middleware.any();
      await handler(req as Request, res as Response, next);

      expect(res.clearCookie).toHaveBeenCalledWith(COOKIE_ACCESS_TOKEN, expect.anything());
      expect(res.clearCookie).toHaveBeenCalledWith(COOKIE_REFRESH_TOKEN, expect.anything());
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it("wipes cookies and returns 401 when user is deactivated", async () => {
      req.cookies = { [COOKIE_ACCESS_TOKEN]: "token-of-deactivated-user" };

      vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
        userId: "deactivated-user-id",
        type: "base",
      });

      vi.mocked(authRepository.findUserById).mockResolvedValue({
        id: "deactivated-user-id",
        email: "deactivated@test.com",
        isActive: false, // DEACTIVATED
        isPlatformAdmin: false,
        memberships: [],
      });

      const handler = middleware.any();
      await handler(req as Request, res as Response, next);

      expect(res.clearCookie).toHaveBeenCalledWith(COOKIE_ACCESS_TOKEN, expect.anything());
      expect(res.clearCookie).toHaveBeenCalledWith(COOKIE_REFRESH_TOKEN, expect.anything());
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      const err = vi.mocked(next).mock.calls[0][0] as UnauthorizedError;
      expect(err.message).toContain("deactivated");
    });
  });

  describe("Tenant Context Resolution (middleware.tenant())", () => {
    it("resolves valid tenant context and attaches TenantAuthContext to req.user", async () => {
      req.cookies = { [COOKIE_ACCESS_TOKEN]: "tenant-token" };

      vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
        userId: "user-1",
        type: "tenant",
        tenantId: "tenant-abc",
      });

      vi.mocked(authRepository.findUserById).mockResolvedValue({
        id: "user-1",
        email: "owner@tenant.com",
        isActive: true,
        isPlatformAdmin: false,
        memberships: [
          {
            id: "membership-1",
            tenantId: "tenant-abc",
            role: "OWNER",
            tenantActive: true,
          },
        ],
      });

      const handler = middleware.tenant();
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as any).user).toEqual({
        type: "tenant",
        userId: "user-1",
        email: "owner@tenant.com",
        membershipId: "membership-1",
        tenantId: "tenant-abc",
        tenantRole: "OWNER",
        isPlatformAdmin: false,
      });
    });

    it("rejects non-tenant context with 403 Forbidden", async () => {
      req.cookies = { [COOKIE_ACCESS_TOKEN]: "base-token" };

      vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
        userId: "user-1",
        type: "base", // Not a tenant token
      });

      vi.mocked(authRepository.findUserById).mockResolvedValue({
        id: "user-1",
        email: "user@test.com",
        isActive: true,
        isPlatformAdmin: false,
        memberships: [],
      });

      const handler = middleware.tenant();
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it("rejects with 401 Unauthorized if user is not a member of the claimed tenant", async () => {
      req.cookies = { [COOKIE_ACCESS_TOKEN]: "token-wrong-tenant" };

      vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
        userId: "user-1",
        type: "tenant",
        tenantId: "foreign-tenant",
      });

      vi.mocked(authRepository.findUserById).mockResolvedValue({
        id: "user-1",
        email: "user@test.com",
        isActive: true,
        isPlatformAdmin: false,
        memberships: [
          {
            id: "membership-1",
            tenantId: "own-tenant", // Different tenant
            role: "USER",
            tenantActive: true,
          },
        ],
      });

      const handler = middleware.tenant();
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it("rejects with 403 Forbidden if the claimed tenant organization is inactive", async () => {
      req.cookies = { [COOKIE_ACCESS_TOKEN]: "token-inactive-tenant" };

      vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
        userId: "user-1",
        type: "tenant",
        tenantId: "inactive-tenant",
      });

      vi.mocked(authRepository.findUserById).mockResolvedValue({
        id: "user-1",
        email: "user@test.com",
        isActive: true,
        isPlatformAdmin: false,
        memberships: [
          {
            id: "membership-1",
            tenantId: "inactive-tenant",
            role: "USER",
            tenantActive: false, // TENANT INACTIVE
          },
        ],
      });

      const handler = middleware.tenant();
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe("Platform Admin Context Resolution (middleware.admin())", () => {
    it("resolves valid admin context when user isPlatformAdmin is true", async () => {
      req.cookies = { [COOKIE_ACCESS_TOKEN]: "admin-token" };

      vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
        userId: "admin-user-id",
        type: "admin",
      });

      vi.mocked(authRepository.findUserById).mockResolvedValue({
        id: "admin-user-id",
        email: "admin@platform.io",
        isActive: true,
        isPlatformAdmin: true,
        memberships: [],
      });

      const handler = middleware.admin();
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as any).user).toEqual({
        type: "admin",
        userId: "admin-user-id",
        email: "admin@platform.io",
        isPlatformAdmin: true,
      });
    });

    it("rejects with 403 Forbidden when user is NOT platform admin", async () => {
      req.cookies = { [COOKIE_ACCESS_TOKEN]: "token-non-admin" };

      vi.mocked(tokenService.verifyAccessToken).mockReturnValue({
        userId: "regular-user-id",
        type: "base",
      });

      vi.mocked(authRepository.findUserById).mockResolvedValue({
        id: "regular-user-id",
        email: "regular@test.com",
        isActive: true,
        isPlatformAdmin: false,
        memberships: [],
      });

      const handler = middleware.admin();
      await handler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });
});
