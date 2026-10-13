import { describe, it, expect, vi, beforeEach } from "vitest";
import { SelectTenantUseCase } from "../../../../src/modules/auth/application/use-cases/select-tenant.use-case";
import {
  MembershipNotFoundError,
  TenantInactiveError,
} from "../../../../src/modules/auth/domain/errors/auth.errors";
import { NotFoundError } from "../../../../src/shared/errors/not-found.error";
import type { AuthRepository } from "../../../../src/modules/auth/application/interfaces/auth-repository.interface";
import type { TokenService } from "../../../../src/modules/auth/application/interfaces/token-service.interface";
import type { Logger } from "../../../../src/shared/logging/logger.interface";

describe("SelectTenantUseCase (Module 2)", () => {
  let authRepository: AuthRepository;
  let tokenService: TokenService;
  let logger: Logger;
  let useCase: SelectTenantUseCase;

  const mockUser = {
    id: "user-123",
    email: "user@example.com",
    name: "Alice",
    passwordHash: "hash",
    isActive: true,
    isPlatformAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    memberships: [],
  };

  const mockMembership = {
    id: "mem-1",
    userId: "user-123",
    tenantId: "tenant-1",
    tenantName: "Target Tenant",
    tenantEmail: "tenant@example.com",
    tenantActive: true,
    role: "ADMIN" as const,
    createdAt: new Date(),
  };

  beforeEach(() => {
    authRepository = {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn().mockResolvedValue(mockUser),
      registerTenantOwner: vi.fn(),
      registerMember: vi.fn(),
      findMembership: vi.fn().mockResolvedValue(mockMembership),
      createMembership: vi.fn(),
      checkMembershipExists: vi.fn(),
      checkTenantActive: vi.fn().mockResolvedValue(true),
      saveRefreshToken: vi.fn().mockResolvedValue("tok-1"),
      findRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn(),
      revokeRefreshTokenFamily: vi.fn(),
      revokeAllUserRefreshTokens: vi.fn(),
      cleanupExpiredRefreshTokens: vi.fn(),
      cleanupOrphanedAndExpiredTokenFamilies: vi.fn(),
      updateUserPassword: vi.fn(),
    };

    tokenService = {
      generateAccessToken: vi.fn().mockReturnValue("tenant-access-token"),
      generateBaseAccessToken: vi.fn(),
      generateAdminAccessToken: vi.fn(),
      generateRefreshToken: vi.fn().mockReturnValue({
        rawToken: "tenant-refresh-token",
        tokenHash: "hash-1",
        familyId: "fam-1",
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

    useCase = new SelectTenantUseCase(authRepository, tokenService, logger);
  });

  it("selects valid tenant and returns tenant-scoped token", async () => {
    const result = await useCase.execute({
      userId: "user-123",
      tenantId: "tenant-1",
    });

    expect(result.accessToken).toBe("tenant-access-token");
    expect(result.refreshToken).toBe("tenant-refresh-token");
    expect(result.membership.tenantId).toBe("tenant-1");
    expect(result.membership.role).toBe("ADMIN");

    expect(tokenService.generateAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        tenantId: "tenant-1",
        tenantRole: "ADMIN",
      }),
    );
  });

  it("rejects when membership does not exist for the user in the target tenant", async () => {
    (authRepository.findMembership as any).mockResolvedValue(null);

    await expect(
      useCase.execute({
        userId: "user-123",
        tenantId: "unauthorized-tenant",
      }),
    ).rejects.toThrow(MembershipNotFoundError);
  });

  it("rejects when the tenant organization is inactive/deactivated", async () => {
    (authRepository.findMembership as any).mockResolvedValue({
      ...mockMembership,
      tenantActive: false,
    });

    await expect(
      useCase.execute({
        userId: "user-123",
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow(TenantInactiveError);
  });

  it("rejects when user does not exist", async () => {
    (authRepository.findUserById as any).mockResolvedValue(null);

    await expect(
      useCase.execute({
        userId: "unknown-user",
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
