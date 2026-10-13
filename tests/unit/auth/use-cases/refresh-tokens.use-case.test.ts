import { describe, it, expect, vi, beforeEach } from "vitest";
import { RefreshTokensUseCase } from "../../../../src/modules/auth/application/use-cases/refresh-tokens.use-case";
import {
  RefreshTokenInvalidError,
  RefreshTokenExpiredError,
} from "../../../../src/modules/auth/domain/errors/auth.errors";
import type { AuthRepository } from "../../../../src/modules/auth/application/interfaces/auth-repository.interface";
import type { TokenService } from "../../../../src/modules/auth/application/interfaces/token-service.interface";
import type { Logger } from "../../../../src/shared/logging/logger.interface";

describe("RefreshTokensUseCase (Module 2 - Token Rotation & Replay Attack Defense)", () => {
  let authRepository: AuthRepository;
  let tokenService: TokenService;
  let logger: Logger;
  let useCase: RefreshTokensUseCase;

  const mockUser = {
    id: "user-123",
    email: "user@example.com",
    name: "Alice",
    passwordHash: "hash",
    isActive: true,
    isPlatformAdmin: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    memberships: [
      {
        id: "mem-1",
        userId: "user-123",
        tenantId: "tenant-1",
        tenantName: "Tenant Alpha",
        tenantEmail: "alpha@example.com",
        tenantActive: true,
        role: "OWNER" as const,
        createdAt: new Date(),
      },
    ],
  };

  beforeEach(() => {
    authRepository = {
      findUserByEmail: vi.fn(),
      findUserById: vi.fn().mockResolvedValue(mockUser),
      registerTenantOwner: vi.fn(),
      registerMember: vi.fn(),
      findMembership: vi.fn(),
      createMembership: vi.fn(),
      checkMembershipExists: vi.fn(),
      checkTenantActive: vi.fn(),
      saveRefreshToken: vi.fn().mockResolvedValue("token-id-new"),
      findRefreshToken: vi.fn(),
      revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
      revokeRefreshTokenFamily: vi.fn().mockResolvedValue(undefined),
      revokeAllUserRefreshTokens: vi.fn(),
      cleanupExpiredRefreshTokens: vi.fn(),
      cleanupOrphanedAndExpiredTokenFamilies: vi.fn(),
      updateUserPassword: vi.fn(),
    };

    tokenService = {
      generateAccessToken: vi.fn().mockReturnValue("new-access-token"),
      generateBaseAccessToken: vi.fn().mockReturnValue("new-base-token"),
      generateAdminAccessToken: vi.fn().mockReturnValue("new-admin-token"),
      generateRefreshToken: vi.fn(),
      generateRefreshTokenForFamily: vi.fn().mockReturnValue({
        rawToken: "new-raw-refresh-token",
        tokenHash: "new-hash",
        familyId: "family-1",
        expiresIn: 604800,
      }),
      generateInviteToken: vi.fn(),
      verifyAccessToken: vi.fn(),
      verifyRefreshToken: vi.fn().mockReturnValue({
        userId: "user-123",
        tokenId: "token-hash-1",
        type: "refresh",
      }),
      verifyInviteToken: vi.fn(),
      hashToken: vi.fn().mockReturnValue("hashed"),
    };

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };

    useCase = new RefreshTokensUseCase(authRepository, tokenService, logger);
  });

  it("rotates refresh token and issues new tenant access token for single tenant user", async () => {
    (authRepository.findRefreshToken as any).mockResolvedValue({
      id: "token-db-1",
      userId: "user-123",
      familyId: "family-1",
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null, // Valid unrevoked token
    });

    const result = await useCase.execute({
      refreshToken: "valid-raw-refresh-token",
    });

    expect(result.accessToken).toBe("new-access-token");
    expect(result.refreshToken).toBe("new-raw-refresh-token");

    // Old token was revoked
    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith("token-db-1");

    // New token was saved inheriting the same familyId
    expect(tokenService.generateRefreshTokenForFamily).toHaveBeenCalledWith(
      "user-123",
      "family-1",
    );
    expect(authRepository.saveRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        familyId: "family-1",
      }),
    );
  });

  it("REPLAY ATTACK: when an already-revoked token is used, REVOKES ENTIRE FAMILY immediately", async () => {
    (authRepository.findRefreshToken as any).mockResolvedValue({
      id: "token-stolen-1",
      userId: "user-123",
      familyId: "family-stolen-1",
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: new Date(), // ALREADY REVOKED! Someone is replaying an old token
    });

    await expect(
      useCase.execute({ refreshToken: "replayed-refresh-token" }),
    ).rejects.toThrow(RefreshTokenInvalidError);

    // Assert that the entire family was revoked to protect the victim
    expect(authRepository.revokeRefreshTokenFamily).toHaveBeenCalledWith(
      "family-stolen-1",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Refresh token reuse detected — revoking family"),
      expect.any(Object),
    );
  });

  it("rejects expired refresh token", async () => {
    (authRepository.findRefreshToken as any).mockResolvedValue({
      id: "token-old-1",
      userId: "user-123",
      familyId: "family-1",
      expiresAt: new Date(Date.now() - 1000), // Expired
      revokedAt: null,
    });

    await expect(
      useCase.execute({ refreshToken: "expired-refresh-token" }),
    ).rejects.toThrow(RefreshTokenExpiredError);
  });

  it("rejects refresh when user account is deactivated", async () => {
    (authRepository.findRefreshToken as any).mockResolvedValue({
      id: "token-1",
      userId: "user-123",
      familyId: "family-1",
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: null,
    });

    (authRepository.findUserById as any).mockResolvedValue({
      ...mockUser,
      isActive: false, // Inactive user
    });

    await expect(
      useCase.execute({ refreshToken: "valid-token" }),
    ).rejects.toThrow(RefreshTokenInvalidError);
  });
});
