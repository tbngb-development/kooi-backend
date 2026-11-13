import { describe, it, expect, vi, beforeEach } from "vitest";
import { RefreshTokenCleanupService } from "../infrastructure/services/refresh-token-cleanup.service";
import { RefreshTokenCleanupScheduler } from "../infrastructure/jobs/refresh-token-cleanup.scheduler";
import { LogoutUseCase } from "../application/use-cases/logout.use-case";
import { PrismaAuthRepository } from "../infrastructure/repositories/prisma-auth.repository";
import type { AuthRepository } from "../application/interfaces/auth-repository.interface";
import type { TokenService } from "../application/interfaces/token-service.interface";
import type { Logger } from "../../../shared/logging/logger.interface";
import prisma from "../../../shared/config/database/prisma";

vi.mock("../../../shared/config/database/prisma", () => ({
  default: {
    refreshToken: {
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe("Refresh Token Cleanup & Family Lifecycle", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
  });

  describe("PrismaAuthRepository.cleanupOrphanedAndExpiredTokenFamilies", () => {
    it("deletes expired tokens and revoked tokens older than the grace period", async () => {
      vi.mocked(prisma.refreshToken.deleteMany).mockResolvedValue({ count: 42 });

      const repo = new PrismaAuthRepository();
      const count = await repo.cleanupOrphanedAndExpiredTokenFamilies(1);

      expect(count).toBe(42);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { expiresAt: { lt: expect.any(Date) } },
            { revokedAt: { lt: expect.any(Date) } },
          ],
        },
      });

      // Verify cutoff calculation for 1 day
      const callArgs = vi.mocked(prisma.refreshToken.deleteMany).mock.calls[0][0];
      const orConditions = callArgs?.where?.OR as Array<{ expiresAt?: { lt: Date }; revokedAt?: { lt: Date } }>;
      const revokedCondition = orConditions?.find((c) => c.revokedAt);
      expect(revokedCondition).toBeDefined();

      const revokedCutoff = revokedCondition!.revokedAt!.lt;
      const expectedTime = Date.now() - 24 * 60 * 60 * 1000;
      // Should be within 5 seconds of 24h ago
      expect(Math.abs(revokedCutoff.getTime() - expectedTime)).toBeLessThan(5000);
    });

    it("cleanupExpiredRefreshTokens delegates to cleanupOrphanedAndExpiredTokenFamilies", async () => {
      vi.mocked(prisma.refreshToken.deleteMany).mockResolvedValue({ count: 10 });

      const repo = new PrismaAuthRepository();
      const count = await repo.cleanupExpiredRefreshTokens(2);

      expect(count).toBe(10);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalled();
    });
  });

  describe("RefreshTokenCleanupService", () => {
    it("invokes repository cleanup with default 1 day retention and logs result", async () => {
      const mockAuthRepo = {
        cleanupOrphanedAndExpiredTokenFamilies: vi.fn().mockResolvedValue(15),
      } as unknown as AuthRepository;

      const service = new RefreshTokenCleanupService(mockAuthRepo, mockLogger);
      const deleted = await service.cleanup();

      expect(deleted).toBe(15);
      expect(mockAuthRepo.cleanupOrphanedAndExpiredTokenFamilies).toHaveBeenCalledWith(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Executed family-aware refresh token cleanup",
        expect.objectContaining({
          deletedTokensCount: 15,
          retentionDays: 1,
        }),
      );
    });
  });

  describe("RefreshTokenCleanupScheduler", () => {
    it("runs startup sweep asynchronously when started", async () => {
      const mockService = {
        cleanup: vi.fn().mockResolvedValue(25),
      } as unknown as RefreshTokenCleanupService;

      const scheduler = new RefreshTokenCleanupScheduler(
        mockService,
        mockLogger,
        "0 3 * * *",
        1,
      );

      scheduler.start();

      // Give async startup call a tick to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockService.cleanup).toHaveBeenCalledWith(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Completed refresh token cleanup run",
        expect.objectContaining({
          trigger: "scheduler.startup",
          deletedTokensCount: 25,
        }),
      );

      scheduler.stop();
    });
  });

  describe("LogoutUseCase", () => {
    it("revokes entire token family when user logs out", async () => {
      const mockAuthRepo = {
        findRefreshToken: vi.fn().mockResolvedValue({
          id: "token-123",
          userId: "user-456",
          familyId: "fam-789",
          revokedAt: null,
          expiresAt: new Date(Date.now() + 86400000),
        }),
        revokeRefreshTokenFamily: vi.fn().mockResolvedValue(undefined),
      } as unknown as AuthRepository;

      const mockTokenService = {
        verifyRefreshToken: vi.fn().mockReturnValue({
          userId: "user-456",
          tokenId: "token-hash-xyz",
          type: "refresh",
        }),
      } as unknown as TokenService;

      const useCase = new LogoutUseCase(mockAuthRepo, mockTokenService, mockLogger);
      await useCase.execute({ refreshToken: "raw-refresh-token" });

      expect(mockAuthRepo.revokeRefreshTokenFamily).toHaveBeenCalledWith("fam-789");
      expect(mockLogger.info).toHaveBeenCalledWith(
        "User logged out",
        expect.objectContaining({
          userId: "user-456",
          familyId: "fam-789",
        }),
      );
    });
  });
});

