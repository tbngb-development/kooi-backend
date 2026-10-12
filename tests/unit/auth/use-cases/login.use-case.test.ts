import { describe, it, expect, vi, beforeEach } from "vitest";
import { LoginUseCase } from "../../../../src/modules/auth/application/use-cases/login.use-case";
import { UnauthorizedError } from "../../../../src/shared/errors/unauthorized.error";
import type { AuthRepository } from "../../../../src/modules/auth/application/interfaces/auth-repository.interface";
import type { PasswordService } from "../../../../src/modules/auth/application/interfaces/password-service.interface";
import type { TokenService } from "../../../../src/modules/auth/application/interfaces/token-service.interface";
import type { Logger } from "../../../../src/shared/logging/logger.interface";

describe("LoginUseCase (Module 2 - Workspace Resolution & Credentials)", () => {
  let authRepository: AuthRepository;
  let passwordService: PasswordService;
  let tokenService: TokenService;
  let logger: Logger;
  let useCase: LoginUseCase;

  const mockUserSingleTenant = {
    id: "user-1",
    email: "single@example.com",
    name: "Bob",
    passwordHash: "valid-hash",
    isActive: true,
    isPlatformAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    memberships: [
      {
        id: "mem-1",
        userId: "user-1",
        tenantId: "tenant-1",
        tenantName: "Acme Corp",
        tenantEmail: "acme@example.com",
        tenantActive: true,
        role: "OWNER" as const,
        createdAt: new Date(),
      },
    ],
  };

  const mockUserMultiTenant = {
    id: "user-2",
    email: "multi@example.com",
    name: "Charlie",
    passwordHash: "valid-hash",
    isActive: true,
    isPlatformAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    memberships: [
      {
        id: "mem-1",
        userId: "user-2",
        tenantId: "tenant-1",
        tenantName: "Workspace Alpha",
        tenantEmail: "alpha@example.com",
        tenantActive: true,
        role: "ADMIN" as const,
        createdAt: new Date(),
      },
      {
        id: "mem-2",
        userId: "user-2",
        tenantId: "tenant-2",
        tenantName: "Workspace Beta",
        tenantEmail: "beta@example.com",
        tenantActive: true,
        role: "USER" as const,
        createdAt: new Date(),
      },
    ],
  };

  beforeEach(() => {
    authRepository = {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn(),
      registerTenantOwner: vi.fn(),
      registerMember: vi.fn(),
      findMembership: vi.fn(),
      createMembership: vi.fn(),
      checkMembershipExists: vi.fn(),
      checkTenantActive: vi.fn(),
      saveRefreshToken: vi.fn().mockResolvedValue("token-id-1"),
      findRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn(),
      revokeRefreshTokenFamily: vi.fn(),
      revokeAllUserRefreshTokens: vi.fn(),
      cleanupExpiredRefreshTokens: vi.fn(),
      cleanupOrphanedAndExpiredTokenFamilies: vi.fn(),
      updateUserPassword: vi.fn(),
    };

    passwordService = {
      hash: vi.fn(),
      compare: vi.fn().mockResolvedValue(true),
    };

    tokenService = {
      generateAccessToken: vi.fn().mockReturnValue("mock-access-token"),
      generateBaseAccessToken: vi.fn().mockReturnValue("mock-base-token"),
      generateAdminAccessToken: vi.fn().mockReturnValue("mock-admin-token"),
      generateRefreshToken: vi.fn().mockReturnValue({
        rawToken: "mock-refresh-token",
        tokenHash: "mock-hash",
        familyId: "mock-family",
        expiresIn: 604800,
      }),
      generateRefreshTokenForFamily: vi.fn(),
      generateInviteToken: vi.fn(),
      verifyAccessToken: vi.fn(),
      verifyRefreshToken: vi.fn(),
      verifyInviteToken: vi.fn(),
      hashToken: vi.fn(),
    };

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };

    useCase = new LoginUseCase(
      authRepository,
      passwordService,
      tokenService,
      logger,
    );
  });

  it("authenticates single-tenant user and returns tenant-scoped token directly", async () => {
    (authRepository.findUserByEmail as any).mockResolvedValue(
      mockUserSingleTenant,
    );

    const result = await useCase.execute({
      email: "single@example.com",
      password: "Password123!",
    });

    expect(result.requiresTenantSelection).toBe(false);
    expect(result.accessToken).toBe("mock-access-token");
    expect(result.refreshToken).toBe("mock-refresh-token");
    expect(result.memberships).toHaveLength(1);
    expect(result.memberships[0].tenantId).toBe("tenant-1");
  });

  it("authenticates multi-tenant user without tenantId and prompts for tenant selection", async () => {
    (authRepository.findUserByEmail as any).mockResolvedValue(
      mockUserMultiTenant,
    );

    const result = await useCase.execute({
      email: "multi@example.com",
      password: "Password123!",
    });

    expect(result.requiresTenantSelection).toBe(true);
    expect(result.memberships).toHaveLength(2);
    expect(result.accessToken).toBe("mock-base-token");
  });

  it("authenticates multi-tenant user WITH specific tenantId and logs in directly to that tenant", async () => {
    (authRepository.findUserByEmail as any).mockResolvedValue(
      mockUserMultiTenant,
    );

    const result = await useCase.execute({
      email: "multi@example.com",
      password: "Password123!",
      tenantId: "tenant-2",
    });

    expect(result.requiresTenantSelection).toBe(false);
    expect(tokenService.generateAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-2", tenantRole: "USER" }),
    );
  });

  it("rejects login when password does not match", async () => {
    (authRepository.findUserByEmail as any).mockResolvedValue(
      mockUserSingleTenant,
    );
    (passwordService.compare as any).mockResolvedValue(false);

    await expect(
      useCase.execute({
        email: "single@example.com",
        password: "WrongPassword!",
      }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("rejects login when user is not found", async () => {
    (authRepository.findUserByEmail as any).mockResolvedValue(null);

    await expect(
      useCase.execute({
        email: "nonexistent@example.com",
        password: "Password123!",
      }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("rejects login when user account is deactivated with ForbiddenError (403)", async () => {
    (authRepository.findUserByEmail as any).mockResolvedValue({
      ...mockUserSingleTenant,
      isActive: false,
    });

    await expect(
      useCase.execute({
        email: "single@example.com",
        password: "Password123!",
      }),
    ).rejects.toThrow(/deactivated/i);
  });
});
