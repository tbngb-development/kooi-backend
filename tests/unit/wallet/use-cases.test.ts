import { describe, it, expect, vi, beforeEach } from "vitest";
import { DebitWalletForCallUseCase } from "../../../src/modules/wallet/application/use-cases/debit-wallet.use-case";
import { AdjustWalletUseCase } from "../../../src/modules/wallet/application/use-cases/adjust-wallet.use-case";
import { ExpireBonusCreditsUseCase } from "../../../src/modules/wallet/application/use-cases/expire-bonus-credits.use-case";
import { CheckBalanceForBatchUseCase } from "../../../src/modules/wallet/application/use-cases/check-balance-for-batch.use-case";
import { CheckLowBalanceUseCase } from "../../../src/modules/wallet/application/use-cases/check-low-balance.use-case";
import type {
  WalletRepository,
  ExpiredBonusWallet,
} from "../../../src/modules/wallet/application/interfaces/wallet-repository.interface";
import type {
  PlanRepository,
  TenantActivePlan,
} from "../../../src/modules/plans/application/interfaces/plan-repository.interface";
import type { IEmailService } from "../../../src/shared/config/external/email/email.interface";
import type { Logger } from "../../../src/shared/logging/logger.interface";
import {
  TenantPlanNotFoundError,
  PlanNotActiveError,
} from "../../../src/modules/plans/domain/errors/plan.errors";
import { InsufficientBalanceError } from "../../../src/modules/wallet/domain/errors/wallet.errors";
import type { Wallet, WalletTransaction } from "@prisma/client";
import prisma from "../../../src/shared/config/database/prisma";

function createMockWalletRepo(): WalletRepository {
  return {
    findByTenantId: vi.fn(),
    ensureWallet: vi.fn(),
    create: vi.fn(),
    credit: vi.fn(),
    debit: vi.fn(),
    listTransactions: vi.fn(),
    findWalletsWithExpiredBonus: vi.fn(),
    expireBonus: vi.fn(),
    findTransactionByIdempotencyKey: vi.fn(),
  };
}

function createMockPlanRepo(): PlanRepository {
  return {
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    listActive: vi.fn(),
    listAll: vi.fn(),
    findVersionById: vi.fn(),
    findLatestPublishedVersion: vi.fn(),
    createVersion: vi.fn(),
    publishVersion: vi.fn(),
    archiveVersion: vi.fn(),
    getActivePlanForTenant: vi.fn(),
    getTenantPlan: vi.fn(),
    selectPlan: vi.fn(),
    activatePlan: vi.fn(),
    updateOverrides: vi.fn(),
    updateStatus: vi.fn(),
    listSubscribers: vi.fn(),
    recordBonusExpiredEvent: vi.fn(),
    countActiveCampaigns: vi.fn(),
    countRunningCampaigns: vi.fn(),
    countConcurrentCampaignsAtTime: vi.fn(),
    countAgents: vi.fn(),
    countTeamMembers: vi.fn(),
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createMockEmailService(): IEmailService {
  return {
    send: vi.fn().mockResolvedValue(undefined),
  };
}

const mockActivePlan: TenantActivePlan = {
  tenantPlanId: "tp-1",
  tenantId: "tenant-1",
  status: "ACTIVE",
  activatedAt: new Date(),
  bonusExpiresAt: new Date(Date.now() + 86400000),
  planId: "plan-1",
  planVersionId: "pv-1",
  version: 1,
  pricingModel: "STANDARD",
  onboardingFee: 500000,
  perMinuteRate: 300, // 3.00 INR per min
  billingMinimumSec: 30,
  billingIncrementSec: 10,
  bonusCredits: 100000,
  bonusExpiryDays: 30,
  includedMinutesMonth: 0,
  freePeriodDays: 0,
  lowBalanceThreshold: 10000, // 100 INR
  maxConcurrentCampaigns: 5,
  maxDailyDials: 1000,
  maxAgents: 3,
  maxTeamMembers: 10,
  isGrandfathered: false,
  planName: "Starter",
  planSlug: "starter",
};

const mockWallet: Wallet = {
  id: "wallet-1",
  tenantId: "tenant-1",
  cashBalance: 50000, // 500 INR
  bonusBalance: 20000, // 200 INR
  bonusExpiresAt: new Date(Date.now() + 86400000),
  currency: "INR",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTx: WalletTransaction = {
  id: "tx-1",
  walletId: "wallet-1",
  tenantId: "tenant-1",
  type: "DEBIT",
  amount: 450,
  cashDelta: -450,
  bonusDelta: 0,
  cashBalanceAfter: 49550,
  bonusBalanceAfter: 20000,
  description: "AI Call call-1",
  sourceType: "CALL",
  sourceId: "call-1",
  idempotencyKey: "call:call-1:bolna-1",
  createdBy: "SYSTEM",
  createdAt: new Date(),
};

describe("Wallet Use Cases (Module 5 - Financial Accounting)", () => {
  let walletRepo: ReturnType<typeof createMockWalletRepo>;
  let planRepo: ReturnType<typeof createMockPlanRepo>;
  let logger: ReturnType<typeof createMockLogger>;
  let email: ReturnType<typeof createMockEmailService>;

  beforeEach(() => {
    walletRepo = createMockWalletRepo();
    planRepo = createMockPlanRepo();
    logger = createMockLogger();
    email = createMockEmailService();
    vi.clearAllMocks();
  });

  describe("DebitWalletForCallUseCase", () => {
    it("returns null if durationSec is zero or negative", async () => {
      const checkLowBalance = { execute: vi.fn() } as any;
      const stopBatches = { execute: vi.fn() } as any;
      const useCase = new DebitWalletForCallUseCase(
        walletRepo,
        planRepo,
        checkLowBalance,
        stopBatches,
        logger,
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        callId: "call-1",
        bolnaCallId: "bolna-1",
        durationSec: 0,
      });

      expect(result).toBeNull();
      expect(walletRepo.debit).not.toHaveBeenCalled();
    });

    it("throws TenantPlanNotFoundError when tenant has no active plan", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue(null);
      const checkLowBalance = { execute: vi.fn() } as any;
      const stopBatches = { execute: vi.fn() } as any;
      const useCase = new DebitWalletForCallUseCase(
        walletRepo,
        planRepo,
        checkLowBalance,
        stopBatches,
        logger,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          callId: "call-1",
          bolnaCallId: "bolna-1",
          durationSec: 60,
        }),
      ).rejects.toThrow(TenantPlanNotFoundError);
    });

    it("throws PlanNotActiveError when active plan status is not ACTIVE", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActivePlan,
        status: "EXPIRED" as any,
      });
      const checkLowBalance = { execute: vi.fn() } as any;
      const stopBatches = { execute: vi.fn() } as any;
      const useCase = new DebitWalletForCallUseCase(
        walletRepo,
        planRepo,
        checkLowBalance,
        stopBatches,
        logger,
      );

      await expect(
        useCase.execute({
          tenantId: "tenant-1",
          callId: "call-1",
          bolnaCallId: "bolna-1",
          durationSec: 60,
        }),
      ).rejects.toThrow(PlanNotActiveError);
    });

    it("calculates call cost, calls walletRepo.debit with overdraft permitted, and triggers balance checks", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue(mockActivePlan);
      vi.mocked(walletRepo.debit).mockResolvedValue(mockTx);
      const checkLowBalance = { execute: vi.fn().mockResolvedValue(undefined) } as any;
      const stopBatches = { execute: vi.fn().mockResolvedValue(undefined) } as any;
      const useCase = new DebitWalletForCallUseCase(
        walletRepo,
        planRepo,
        checkLowBalance,
        stopBatches,
        logger,
      );

      // duration: 45 sec -> billingMinimum: 30s, increment: 10s -> billable: 50s
      // perMinuteRate: 300 -> 50 * 300 / 60 = 250 paisa
      const result = await useCase.execute({
        tenantId: "tenant-1",
        callId: "call-1",
        bolnaCallId: "bolna-1",
        durationSec: 45,
      });

      expect(result).toEqual({
        amountPaisa: 250,
        billableSeconds: 50,
        planVersionId: "pv-1",
        appliedRate: 300,
        appliedMinSec: 30,
        appliedIncrementSec: 10,
      });

      expect(walletRepo.debit).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        amount: 250,
        description: "AI Call call-1 (50s billable @ ₹3.00/min)",
        sourceType: "CALL",
        sourceId: "call-1",
        idempotencyKey: "call:call-1:bolna-1",
        createdBy: "SYSTEM",
        allowOverdraft: true,
      });

      expect(checkLowBalance.execute).toHaveBeenCalledWith({ tenantId: "tenant-1" });
      expect(stopBatches.execute).toHaveBeenCalledWith({ tenantId: "tenant-1" });
    });

    it("does not fail the call debit if stopBatches fails", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue(mockActivePlan);
      vi.mocked(walletRepo.debit).mockResolvedValue(mockTx);
      const checkLowBalance = { execute: vi.fn().mockResolvedValue(undefined) } as any;
      const stopBatches = { execute: vi.fn().mockRejectedValue(new Error("Redis error")) } as any;
      const useCase = new DebitWalletForCallUseCase(
        walletRepo,
        planRepo,
        checkLowBalance,
        stopBatches,
        logger,
      );

      const result = await useCase.execute({
        tenantId: "tenant-1",
        callId: "call-1",
        bolnaCallId: "bolna-1",
        durationSec: 30,
      });

      expect(result).not.toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        "Stop batches check failed",
        expect.any(Error),
        expect.objectContaining({ tenantId: "tenant-1" }),
      );
    });
  });

  describe("AdjustWalletUseCase", () => {
    it("performs admin DEBIT adjustment and returns formatted response", async () => {
      vi.mocked(walletRepo.ensureWallet).mockResolvedValue(mockWallet);
      vi.mocked(walletRepo.debit).mockResolvedValue({
        ...mockTx,
        id: "tx-debit-adj",
        type: "DEBIT",
        amount: 5000,
        sourceType: "ADMIN_ADJUSTMENT",
        createdBy: "admin-user-1",
      });

      const useCase = new AdjustWalletUseCase(walletRepo, logger);
      const result = await useCase.execute(
        {
          tenantId: "tenant-1",
          amount: 5000,
          type: "DEBIT",
          description: "Administrative manual correction",
        },
        "admin-user-1",
      );

      expect(walletRepo.ensureWallet).toHaveBeenCalledWith("tenant-1");
      expect(walletRepo.debit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          amount: 5000,
          description: "Administrative manual correction",
          sourceType: "ADMIN_ADJUSTMENT",
          createdBy: "admin-user-1",
        }),
      );
      expect(result.id).toBe("tx-debit-adj");
      expect(result.amount).toBe(5000);
      expect(result.type).toBe("DEBIT");
    });

    it("performs admin CREDIT adjustment with parsed bonus expiration", async () => {
      vi.mocked(walletRepo.ensureWallet).mockResolvedValue(mockWallet);
      const expiryStr = new Date(Date.now() + 600000).toISOString();
      vi.mocked(walletRepo.credit).mockResolvedValue({
        ...mockTx,
        id: "tx-credit-adj",
        type: "CREDIT",
        amount: 10000,
        sourceType: "ADMIN_ADJUSTMENT",
        createdBy: "admin-user-1",
      });

      const useCase = new AdjustWalletUseCase(walletRepo, logger);
      const result = await useCase.execute(
        {
          tenantId: "tenant-1",
          amount: 10000,
          type: "CREDIT",
          targetBalance: "BONUS",
          description: "Promotional bonus grant",
          bonusExpiresAt: expiryStr,
        },
        "admin-user-1",
      );

      expect(walletRepo.credit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          amount: 10000,
          type: "CREDIT",
          targetBalance: "BONUS",
          bonusExpiresAt: expect.any(Date),
          createdBy: "admin-user-1",
        }),
      );
      expect(result.id).toBe("tx-credit-adj");
    });
  });

  describe("ExpireBonusCreditsUseCase", () => {
    it("returns zero counts if no wallets have expired bonus", async () => {
      vi.mocked(walletRepo.findWalletsWithExpiredBonus).mockResolvedValue([]);
      const useCase = new ExpireBonusCreditsUseCase(walletRepo, planRepo, email, logger);

      const result = await useCase.execute();

      expect(result).toEqual({ processed: 0, skipped: 0, failed: 0 });
      expect(walletRepo.expireBonus).not.toHaveBeenCalled();
    });

    it("expires bonus atomically, logs audit event, and sends notification email", async () => {
      const expiredWallet: ExpiredBonusWallet = {
        id: "wallet-1",
        tenantId: "tenant-1",
        bonusBalance: 5000,
        bonusExpiresAt: new Date(Date.now() - 3600000),
        currency: "INR",
        tenant: {
          name: "Acme Corp",
          email: "billing@acme.com",
        },
      };

      vi.mocked(walletRepo.findWalletsWithExpiredBonus).mockResolvedValue([expiredWallet]);
      vi.mocked(walletRepo.expireBonus).mockResolvedValue({
        ...mockTx,
        id: "tx-expire-1",
        type: "BONUS_EXPIRY",
        amount: 5000,
      });

      const useCase = new ExpireBonusCreditsUseCase(walletRepo, planRepo, email, logger);
      const result = await useCase.execute();

      expect(result).toEqual({ processed: 1, skipped: 0, failed: 0 });
      expect(walletRepo.expireBonus).toHaveBeenCalledWith("tenant-1");
      expect(planRepo.recordBonusExpiredEvent).toHaveBeenCalledWith("tenant-1");
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "billing@acme.com",
          subject: expect.stringContaining("bonus credits expired"),
        }),
      );
    });

    it("increments skipped if wallet was already expired concurrently", async () => {
      const expiredWallet: ExpiredBonusWallet = {
        id: "wallet-1",
        tenantId: "tenant-1",
        bonusBalance: 5000,
        bonusExpiresAt: new Date(Date.now() - 3600000),
        currency: "INR",
        tenant: {
          name: "Acme Corp",
          email: "billing@acme.com",
        },
      };

      vi.mocked(walletRepo.findWalletsWithExpiredBonus).mockResolvedValue([expiredWallet]);
      vi.mocked(walletRepo.expireBonus).mockResolvedValue(null); // already expired

      const useCase = new ExpireBonusCreditsUseCase(walletRepo, planRepo, email, logger);
      const result = await useCase.execute();

      expect(result).toEqual({ processed: 0, skipped: 1, failed: 0 });
      expect(planRepo.recordBonusExpiredEvent).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it("increments failed and continues if expireBonus throws", async () => {
      const wallet1: ExpiredBonusWallet = {
        id: "w-1",
        tenantId: "tenant-1",
        bonusBalance: 5000,
        bonusExpiresAt: new Date(),
        currency: "INR",
        tenant: { name: "Tenant 1", email: "t1@test.com" },
      };
      const wallet2: ExpiredBonusWallet = {
        id: "w-2",
        tenantId: "tenant-2",
        bonusBalance: 3000,
        bonusExpiresAt: new Date(),
        currency: "INR",
        tenant: { name: "Tenant 2", email: "t2@test.com" },
      };

      vi.mocked(walletRepo.findWalletsWithExpiredBonus).mockResolvedValue([wallet1, wallet2]);
      vi.mocked(walletRepo.expireBonus)
        .mockRejectedValueOnce(new Error("Database lock conflict"))
        .mockResolvedValueOnce({
          ...mockTx,
          id: "tx-expire-2",
          type: "BONUS_EXPIRY",
          amount: 3000,
        });

      const useCase = new ExpireBonusCreditsUseCase(walletRepo, planRepo, email, logger);
      const result = await useCase.execute();

      expect(result).toEqual({ processed: 1, skipped: 0, failed: 1 });
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to expire bonus for tenant",
        expect.any(Error),
        expect.objectContaining({ tenantId: "tenant-1" }),
      );
    });
  });

  describe("CheckBalanceForBatchUseCase", () => {
    it("throws TenantPlanNotFoundError when active plan is missing", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue(null);
      const useCase = new CheckBalanceForBatchUseCase(walletRepo, planRepo, logger);

      await expect(
        useCase.execute({ tenantId: "tenant-1", leadCount: 100 }),
      ).rejects.toThrow(TenantPlanNotFoundError);
    });

    it("throws InsufficientBalanceError when effective purchasing power is zero or negative", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActivePlan,
        lowBalanceThreshold: 0,
      });
      vi.mocked(walletRepo.ensureWallet).mockResolvedValue({
        ...mockWallet,
        cashBalance: 0,
        bonusBalance: 0,
        bonusExpiresAt: null,
      });

      const useCase = new CheckBalanceForBatchUseCase(walletRepo, planRepo, logger);

      await expect(
        useCase.execute({ tenantId: "tenant-1", leadCount: 50 }),
      ).rejects.toThrow(InsufficientBalanceError);
    });

    it("throws InsufficientBalanceError when balance is less than 50% minimum required buffer", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActivePlan,
        perMinuteRate: 300,
        lowBalanceThreshold: 0,
      });
      // 90s avg call @ 300/min = 450 paisa per call
      // 100 leads = 45000 paisa estimated cost
      // 50% min buffer = 22500 paisa
      vi.mocked(walletRepo.ensureWallet).mockResolvedValue({
        ...mockWallet,
        cashBalance: 15000, // 15000 < 22500
        bonusBalance: 0,
        bonusExpiresAt: null,
      });

      const useCase = new CheckBalanceForBatchUseCase(walletRepo, planRepo, logger);

      await expect(
        useCase.execute({ tenantId: "tenant-1", leadCount: 100 }),
      ).rejects.toThrow(InsufficientBalanceError);
    });

    it("returns warning: true when funds cover 50% buffer but are less than estimated cost", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActivePlan,
        perMinuteRate: 300,
        lowBalanceThreshold: 0,
      });
      // 100 leads = 45000 paisa. 50% = 22500.
      // Funds: 30000 -> covers 50%, but < 45000
      vi.mocked(walletRepo.ensureWallet).mockResolvedValue({
        ...mockWallet,
        cashBalance: 30000,
        bonusBalance: 0,
        bonusExpiresAt: null,
      });

      const useCase = new CheckBalanceForBatchUseCase(walletRepo, planRepo, logger);
      const result = await useCase.execute({ tenantId: "tenant-1", leadCount: 100 });

      expect(result).toEqual({
        ok: true,
        warning: true,
        balance: 30000,
        estimatedCost: 45000,
      });
    });

    it("returns warning: false when funds comfortably cover 100% of estimated cost", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActivePlan,
        perMinuteRate: 300,
        lowBalanceThreshold: 0,
      });
      // 100 leads = 45000 paisa. Funds: 50000.
      vi.mocked(walletRepo.ensureWallet).mockResolvedValue({
        ...mockWallet,
        cashBalance: 50000,
        bonusBalance: 0,
        bonusExpiresAt: null,
      });

      const useCase = new CheckBalanceForBatchUseCase(walletRepo, planRepo, logger);
      const result = await useCase.execute({ tenantId: "tenant-1", leadCount: 100 });

      expect(result).toEqual({
        ok: true,
        warning: false,
        balance: 50000,
        estimatedCost: 45000,
      });
    });
  });

  describe("CheckLowBalanceUseCase", () => {
    it("returns early if tenant active plan is missing", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue(null);
      const useCase = new CheckLowBalanceUseCase(walletRepo, planRepo, email, logger);

      await useCase.execute({ tenantId: "tenant-1" });

      expect(walletRepo.findByTenantId).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it("does not send email when effective balance is strictly above low balance threshold", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActivePlan,
        lowBalanceThreshold: 10000, // 100 INR
      });
      vi.mocked(walletRepo.findByTenantId).mockResolvedValue({
        ...mockWallet,
        cashBalance: 15000, // 150 INR > 100 INR threshold
        bonusBalance: 0,
        bonusExpiresAt: null,
      });

      const useCase = new CheckLowBalanceUseCase(walletRepo, planRepo, email, logger);
      await useCase.execute({ tenantId: "tenant-1" });

      expect(email.send).not.toHaveBeenCalled();
    });

    it("sends low balance alert email when effective balance breaches threshold", async () => {
      vi.mocked(planRepo.getActivePlanForTenant).mockResolvedValue({
        ...mockActivePlan,
        lowBalanceThreshold: 10000,
      });
      vi.mocked(walletRepo.findByTenantId).mockResolvedValue({
        ...mockWallet,
        cashBalance: 5000, // 50 INR <= 100 INR threshold
        bonusBalance: 0,
        bonusExpiresAt: null,
      });

      vi.spyOn(prisma.tenant, "findUnique").mockResolvedValue({
        id: "tenant-1",
        name: "Test Tenant",
        email: "tenant@example.com",
      } as any);

      const useCase = new CheckLowBalanceUseCase(walletRepo, planRepo, email, logger);
      await useCase.execute({ tenantId: "tenant-1" });

      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "tenant@example.com",
          subject: "KOOI — Low Wallet Balance Alert",
        }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        "Low balance threshold triggered",
        expect.objectContaining({ tenantId: "tenant-1", balancePaisa: 5000 }),
      );
    });
  });
});
