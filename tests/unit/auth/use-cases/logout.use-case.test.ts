import { describe, it, expect, vi, beforeEach } from "vitest";
import { LogoutUseCase } from "../../../../src/modules/auth/application/use-cases/logout.use-case";
import type { AuthRepository } from "../../../../src/modules/auth/application/interfaces/auth-repository.interface";
import type { TokenService } from "../../../../src/modules/auth/application/interfaces/token-service.interface";
import type { Logger } from "../../../../src/shared/logging/logger.interface";

describe("LogoutUseCase (Module 2 - Idempotent Session Revocation)", () => {
  let authRepository: AuthRepository;
  let tokenService: TokenService;
  let logger: Logger;
  let useCase: LogoutUseCase;

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
      saveRefreshToken: vi.fn(),
      findRefreshToken: vi.fn().mockResolvedValue({
        id: "tok-1",
        userId: "user-1",
        familyId: "fam-1",
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: null,
      }),
      revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
      revokeRefreshTokenFamily: vi.fn(),
      revokeAllUserRefreshTokens: vi.fn(),
      cleanupExpiredRefreshTokens: vi.fn(),
      cleanupOrphanedAndExpiredTokenFamilies: vi.fn(),
      updateUserPassword: vi.fn(),
    };

    tokenService = {
      generateAccessToken: vi.fn(),
      generateBaseAccessToken: vi.fn(),
      generateAdminAccessToken: vi.fn(),
      generateRefreshToken: vi.fn(),
      generateRefreshTokenForFamily: vi.fn(),
      generateInviteToken: vi.fn(),
      verifyAccessToken: vi.fn(),
      verifyRefreshToken: vi.fn().mockReturnValue({
        userId: "user-1",
        tokenId: "tok-hash-1",
        type: "refresh",
      }),
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

    useCase = new LogoutUseCase(authRepository, tokenService, logger);
  });

  it("revokes active refresh token and logs out user", async () => {
    await useCase.execute({ refreshToken: "valid-token" });

    expect(authRepository.findRefreshToken).toHaveBeenCalledWith("tok-hash-1");
    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith("tok-1");
  });

  it("is idempotent: handles already-revoked tokens gracefully without throwing", async () => {
    (authRepository.findRefreshToken as any).mockResolvedValue({
      id: "tok-1",
      userId: "user-1",
      familyId: "fam-1",
      expiresAt: new Date(),
      revokedAt: new Date(), // Already revoked
    });

    await expect(
      useCase.execute({ refreshToken: "already-revoked-token" }),
    ).resolves.not.toThrow();

    expect(authRepository.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it("is idempotent: handles invalid or malformed tokens gracefully without throwing", async () => {
    (tokenService.verifyRefreshToken as any).mockImplementation(() => {
      throw new Error("Malformed JWT token");
    });

    await expect(
      useCase.execute({ refreshToken: "garbage-token" }),
    ).resolves.not.toThrow();
  });
});
