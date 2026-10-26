import { describe, it, expect, vi, beforeEach } from "vitest";
import { SelectPlanUseCase } from "../application/use-cases/select-plan.use-case";
import { CreateOnboardingOrderUseCase } from "../../payments/application/use-cases/create-onboarding-order.use-case";
import {
  PlanNotFoundError,
  TenantPlanAlreadyActiveError,
  CustomPlanSelectionNotAllowedError,
  NoPublishedPlanVersionError,
} from "../domain/errors/plan.errors";
import {
  TrialPlanDoesNotRequirePaymentError,
} from "../../payments/domain/errors/payment.errors";
import type { PlanRepository } from "../application/interfaces/plan-repository.interface";
import type { WalletRepository } from "../../wallet/application/interfaces/wallet-repository.interface";
import type { AutoAssignKeyUseCase } from "../../bolna-api-keys/application/use-cases/auto-assign-key.use-case";
import type { Logger } from "../../../shared/logging/logger.interface";
import type { PlanVersionEntity } from "../domain/entities/plan.entity";

describe("Trial Plan Selection & Onboarding Activation", () => {
  let mockPlanRepo: PlanRepository;
  let mockWalletRepo: WalletRepository;
  let mockAutoAssignKey: AutoAssignKeyUseCase;
  let mockLogger: Logger;

  const tenantId = "tenant-trial-test-123";
  const userId = "user-trial-test-456";

  const trialPlan = {
    id: "plan-trial-001",
    name: "Free Trial Plan",
    slug: "free-trial",
    displayOrder: 1,
    isActive: true,
  };

  const trialVersion: PlanVersionEntity = {
    id: "ver-trial-001",
    planId: "plan-trial-001",
    version: 1,
    status: "PUBLISHED",
    publishedAt: new Date("2026-01-01"),
    archivedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    currency: "INR",
    pricingModel: "STANDARD",
    onboardingFee: 0,
    onboardingFeeOriginal: null,
    perMinuteRate: 100,
    billingMinimumSec: 30,
    billingIncrementSec: 15,
    isTrial: true,
    contactLimit: 50,
    validityDays: 14,
    includedBalance: 5000,
    bonusValidityDays: 14,
    lowBalanceThreshold: 5000,
    maxActiveCampaigns: 5,
    maxLeadsPerBatch: 100,
    maxAgents: 2,
    maxTeamMembers: 1,
    retryAutomation: false,
    industryPackLimit: null,
    callingChannel: "SHARED",
    brochureUpload: false,
    dashboardTier: "BASIC",
    agentCapability: "BASIC",
    integrations: "NONE",
    supportTier: "STANDARD",
  };

  const paidPlan = {
    id: "plan-paid-001",
    name: "Starter Plan",
    slug: "starter",
    displayOrder: 2,
    isActive: true,
  };

  const paidVersion: PlanVersionEntity = {
    ...trialVersion,
    id: "ver-paid-001",
    planId: "plan-paid-001",
    isTrial: false,
    contactLimit: null,
    validityDays: null,
    onboardingFee: 499900,
    includedBalance: 100000,
  };

  beforeEach(() => {
    mockPlanRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findAll: vi.fn(),
      findPublished: vi.fn(),
      findVersionById: vi.fn(),
      findVersionsByPlanId: vi.fn(),
      findLatestPublishedVersion: vi.fn(),
      findActiveVersion: vi.fn(),
      getActivePlanForTenant: vi.fn(),
      getTenantPlan: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      createVersion: vi.fn(),
      publishVersion: vi.fn(),
      archiveVersion: vi.fn(),
      selectPlan: vi.fn(),
      activatePlan: vi.fn(),
      updateOverrides: vi.fn(),
      findExpiredTrials: vi.fn(),
      expireTenantPlan: vi.fn(),
      countSubscribers: vi.fn(),
      findSubscribers: vi.fn(),
    } as unknown as PlanRepository;

    mockWalletRepo = {
      ensureWallet: vi.fn().mockResolvedValue({ id: "wallet-123", tenantId }),
      credit: vi.fn().mockResolvedValue({ id: "tx-123" }),
      getBalance: vi.fn(),
      debit: vi.fn(),
      hasSufficientBalance: vi.fn(),
    } as unknown as WalletRepository;

    mockAutoAssignKey = {
      execute: vi.fn().mockResolvedValue({ success: true, keyId: "key-123" }),
    } as unknown as AutoAssignKeyUseCase;

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;
  });

  describe("SelectPlanUseCase", () => {
    it("should activate a trial plan immediately upon selection", async () => {
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(trialPlan as any);
      vi.mocked(mockPlanRepo.findLatestPublishedVersion).mockResolvedValue(trialVersion);
      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue(null);

      const activatedDate = new Date();
      const expectedExpiry = new Date(activatedDate.getTime() + 14 * 24 * 60 * 60 * 1000);

      vi.mocked(mockPlanRepo.activatePlan).mockResolvedValue({
        id: "tp-trial-123",
        tenantId,
        planId: trialPlan.id,
        planVersionId: trialVersion.id,
        status: "ACTIVE",
        activatedAt: activatedDate,
        expiresAt: expectedExpiry,
        contactsUsed: 0,
      } as any);

      const useCase = new SelectPlanUseCase(
        mockPlanRepo,
        mockWalletRepo,
        mockAutoAssignKey,
        mockLogger,
      );

      const result = await useCase.execute(tenantId, trialPlan.id, userId);

      expect(mockPlanRepo.findById).toHaveBeenCalledWith(trialPlan.id);
      expect(mockPlanRepo.findLatestPublishedVersion).toHaveBeenCalledWith(trialPlan.id);
      expect(mockPlanRepo.activatePlan).toHaveBeenCalledWith(
        tenantId,
        trialVersion.id,
        expect.any(Date),
        userId,
      );
      expect(mockAutoAssignKey.execute).toHaveBeenCalledWith(tenantId);
      expect(mockWalletRepo.ensureWallet).toHaveBeenCalledWith(tenantId);
      expect(mockWalletRepo.credit).toHaveBeenCalledWith({
        tenantId,
        amount: trialVersion.includedBalance,
        type: "BONUS",
        targetBalance: "BONUS",
        description: `Plan bonus balance — ${trialPlan.name} (Free Trial)`,
        sourceType: "PLAN_BONUS",
      });
      expect(mockPlanRepo.selectPlan).not.toHaveBeenCalled();
      expect(result.status).toBe("ACTIVE");
      expect(result.expiresAt).toEqual(expectedExpiry);
    });

    it("should handle Bolna key auto-assignment failure gracefully without aborting activation", async () => {
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(trialPlan as any);
      vi.mocked(mockPlanRepo.findLatestPublishedVersion).mockResolvedValue(trialVersion);
      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue(null);
      vi.mocked(mockAutoAssignKey.execute).mockRejectedValue(new Error("No Bolna keys available"));

      vi.mocked(mockPlanRepo.activatePlan).mockResolvedValue({
        id: "tp-trial-123",
        tenantId,
        planId: trialPlan.id,
        planVersionId: trialVersion.id,
        status: "ACTIVE",
      } as any);

      const useCase = new SelectPlanUseCase(
        mockPlanRepo,
        mockWalletRepo,
        mockAutoAssignKey,
        mockLogger,
      );

      const result = await useCase.execute(tenantId, trialPlan.id, userId);

      expect(result.status).toBe("ACTIVE");
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Trial plan activation — auto-assign Bolna key failed",
        expect.objectContaining({ tenantId }),
      );
    });

    it("should be idempotent when selecting the same already active trial plan version", async () => {
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(trialPlan as any);
      vi.mocked(mockPlanRepo.findLatestPublishedVersion).mockResolvedValue(trialVersion);
      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue({
        status: "ACTIVE",
        planVersionId: trialVersion.id,
      } as any);

      const existingRecord = {
        id: "tp-existing-123",
        tenantId,
        planId: trialPlan.id,
        planVersionId: trialVersion.id,
        status: "ACTIVE",
        activatedAt: new Date("2026-01-01"),
        expiresAt: new Date("2026-01-15"),
        contactsUsed: 12,
      };
      vi.mocked(mockPlanRepo.getTenantPlan).mockResolvedValue(existingRecord as any);

      const useCase = new SelectPlanUseCase(
        mockPlanRepo,
        mockWalletRepo,
        mockAutoAssignKey,
        mockLogger,
      );

      const result = await useCase.execute(tenantId, trialPlan.id, userId);

      expect(result).toEqual(existingRecord);
      expect(mockPlanRepo.activatePlan).not.toHaveBeenCalled();
      expect(mockWalletRepo.credit).not.toHaveBeenCalled();
    });

    it("should throw TenantPlanAlreadyActiveError if another plan is already active", async () => {
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(trialPlan as any);
      vi.mocked(mockPlanRepo.findLatestPublishedVersion).mockResolvedValue(trialVersion);
      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue({
        status: "ACTIVE",
        planVersionId: "ver-other-different",
      } as any);

      const useCase = new SelectPlanUseCase(
        mockPlanRepo,
        mockWalletRepo,
        mockAutoAssignKey,
        mockLogger,
      );

      await expect(useCase.execute(tenantId, trialPlan.id, userId)).rejects.toThrow(
        TenantPlanAlreadyActiveError,
      );
      expect(mockPlanRepo.activatePlan).not.toHaveBeenCalled();
    });

    it("should preserve PENDING_PAYMENT selection for paid plans without activating", async () => {
      vi.mocked(mockPlanRepo.findById).mockResolvedValue(paidPlan as any);
      vi.mocked(mockPlanRepo.findLatestPublishedVersion).mockResolvedValue(paidVersion);
      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue(null);

      vi.mocked(mockPlanRepo.selectPlan).mockResolvedValue({
        id: "tp-paid-123",
        tenantId,
        planId: paidPlan.id,
        planVersionId: paidVersion.id,
        status: "PENDING_PAYMENT",
      } as any);

      const useCase = new SelectPlanUseCase(
        mockPlanRepo,
        mockWalletRepo,
        mockAutoAssignKey,
        mockLogger,
      );

      const result = await useCase.execute(tenantId, paidPlan.id, userId);

      expect(mockPlanRepo.selectPlan).toHaveBeenCalledWith(
        tenantId,
        paidPlan.id,
        paidVersion.id,
        userId,
      );
      expect(mockPlanRepo.activatePlan).not.toHaveBeenCalled();
      expect(mockWalletRepo.ensureWallet).not.toHaveBeenCalled();
      expect(mockWalletRepo.credit).not.toHaveBeenCalled();
      expect(mockAutoAssignKey.execute).not.toHaveBeenCalled();
      expect(result.status).toBe("PENDING_PAYMENT");
    });
  });

  describe("CreateOnboardingOrderUseCase Guard", () => {
    it("should reject creating payment orders for trial plans", async () => {
      const mockRechargeRepo = { create: vi.fn() } as any;
      const mockPaymentProvider = { createOrder: vi.fn() } as any;

      vi.mocked(mockPlanRepo.getTenantPlan).mockResolvedValue({
        id: "tp-trial-123",
        tenantId,
        status: "PENDING_PAYMENT",
      } as any);

      vi.mocked(mockPlanRepo.getActivePlanForTenant).mockResolvedValue({
        planVersionId: trialVersion.id,
        isTrial: true,
        pricingModel: "STANDARD",
        onboardingFee: 0,
      } as any);

      const useCase = new CreateOnboardingOrderUseCase(
        mockPlanRepo,
        mockWalletRepo,
        mockRechargeRepo,
        mockPaymentProvider,
        mockLogger,
      );

      await expect(useCase.execute(tenantId)).rejects.toThrow(
        TrialPlanDoesNotRequirePaymentError,
      );
      expect(mockPaymentProvider.createOrder).not.toHaveBeenCalled();
    });
  });
});
