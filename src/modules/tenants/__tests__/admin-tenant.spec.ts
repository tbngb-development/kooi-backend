import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpdateTenantUseCase } from "../application/use-cases/update-tenant.use-case";
import { GetTenantUseCase } from "../application/use-cases/get-tenant.use-case";
import { GetTenantStatsUseCase } from "../application/use-cases/get-tenant-stats.use-case";
import { adminUpdateTenantSchema } from "../presentation/tenant.schema";
import { TenantNotFoundError } from "../domain/tenant.errors";
import type {
  TenantRepository,
  TenantWithCounts,
  TenantStatsResult,
} from "../application/interfaces/tenant-repository.interface";

describe("Admin Tenant Management (Module 1 - Overview)", () => {
  let mockRepo: TenantRepository;

  const mockTenant: TenantWithCounts = {
    id: "tenant-001",
    name: "Acme Voice Labs",
    email: "billing@acme.com",
    isActive: true,
    suspensionReason: null,
    suspendedAt: null,
    suspendedBy: null,
    termsAccepted: true,
    termsAcceptedAt: new Date("2026-01-01T00:00:00Z"),
    termsVersion: "v1.0",
    workspaceSwitchStatus: "IDLE",
    workspaceSwitchError: null,
    bolnaApiKeyId: "key-123",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    _count: {
      memberships: 3,
      campaigns: 2,
      leads: 1500,
      calls: 1200,
    },
    tenantPlan: {
      id: "tp-1",
      status: "ACTIVE",
      onboardingFeeOverride: null,
      perMinuteRateOverride: null,
      activatedAt: new Date("2026-01-01T00:00:00Z"),
      plan: {
        id: "plan-pro",
        name: "Enterprise Pro",
        slug: "enterprise-pro",
        description: "Scale high-frequency calling",
      },
      planVersion: {
        id: "pv-1",
        version: 1,
        status: "PUBLISHED",
        currency: "INR",
        pricingModel: "STANDARD",
        onboardingFee: 500000,
        perMinuteRate: 350,
        billingMinimumSec: 30,
        billingIncrementSec: 15,
        maxActiveCampaigns: 5,
        maxAgents: 10,
        includedBalance: 100000,
        bonusValidityDays: 30,
      },
    },
    wallet: {
      id: "wallet-1",
      cashBalance: 450000,
      bonusBalance: 50000,
      bonusExpiresAt: null,
      currency: "INR",
      isActive: true,
    },
    bolnaApiKey: {
      id: "key-123",
      keyIdentifier: "bolna_live_****9912",
      type: "CUSTOM",
      isActive: true,
      bolnaProfileName: "Acme Production Bolna",
      bolnaProfileEmail: "ops@acme.com",
      bolnaWalletBalance: 142.5,
      bolnaConcurrencyMax: 20,
      bolnaConcurrencyCurrent: 4,
      bolnaProfileFetchedAt: new Date(),
    },
  };

  const mockStatsResult: TenantStatsResult = {
    tenant: mockTenant,
    stats: {
      totalUsers: 3,
      totalLeads: 1500,
      totalCalls: 1200,
      completedCalls: 980,
      activeCampaigns: 2,
      users: { total: 3 },
      financials: {
        walletCashBalance: 450000,
        walletBonusBalance: 50000,
        walletTotalBalance: 500000,
        totalRechargesCount: 4,
        successfulRechargesCount: 3,
        failedRechargesCount: 1,
        totalRechargedAmountPaisa: 600000,
        customerChargedPaisa: 150000,
        platformCostPaisa: 90000,
      },
      calls: {
        total: 1200,
        completed: 980,
        calling: 5,
        pending: 15,
        failed: 100,
        busy: 50,
        noAnswer: 50,
        totalDurationSeconds: 120000,
        totalBillableSeconds: 135000,
      },
      campaigns: {
        total: 5,
        running: 2,
        draft: 1,
        completed: 2,
        failed: 0,
      },
      batches: {
        total: 8,
        processing: 1,
        completed: 7,
        failed: 0,
      },
      leads: {
        total: 1500,
        pending: 200,
        called: 1100,
        noAnswer: 100,
        failed: 100,
        dncCount: 12,
      },
      assistants: {
        total: 2,
      },
    },
  };

  beforeEach(() => {
    mockRepo = {
      list: vi.fn().mockResolvedValue([mockTenant]),
      findById: vi.fn().mockImplementation((id: string) => {
        if (id === mockTenant.id) return Promise.resolve(mockTenant);
        return Promise.resolve(null);
      }),
      update: vi.fn().mockImplementation((_id: string, data: any) => {
        return Promise.resolve({
          ...mockTenant,
          ...data,
        });
      }),
      getStats: vi.fn().mockResolvedValue(mockStatsResult),
    };
  });

  describe("UpdateTenantUseCase & Suspension Governance", () => {
    it("suspends tenant with reason, timestamp, and admin attribution", async () => {
      const useCase = new UpdateTenantUseCase(mockRepo);
      const adminUserId = "admin-user-999";

      const result = await useCase.execute(
        "tenant-001",
        {
          isActive: false,
          suspensionReason: "Exceeded calling threshold and failed KYC review",
        },
        adminUserId,
      );

      expect(mockRepo.update).toHaveBeenCalledWith(
        "tenant-001",
        expect.objectContaining({
          isActive: false,
          suspensionReason: "Exceeded calling threshold and failed KYC review",
          suspendedBy: "admin-user-999",
          suspendedAt: expect.any(Date),
        }),
      );
      expect(result.isActive).toBe(false);
    });

    it("reactivates tenant and clears suspension metadata", async () => {
      const useCase = new UpdateTenantUseCase(mockRepo);

      await useCase.execute("tenant-001", {
        isActive: true,
      });

      expect(mockRepo.update).toHaveBeenCalledWith("tenant-001", {
        isActive: true,
        suspensionReason: null,
        suspendedAt: null,
        suspendedBy: null,
      });
    });

    it("throws TenantNotFoundError if tenant does not exist", async () => {
      const useCase = new UpdateTenantUseCase(mockRepo);

      await expect(
        useCase.execute("non-existent-tenant", { isActive: false }),
      ).rejects.toThrow(TenantNotFoundError);
    });
  });

  describe("Validation Schema (adminUpdateTenantSchema)", () => {
    it("validates successful suspension payload with valid reason", () => {
      const parsed = adminUpdateTenantSchema.safeParse({
        isActive: false,
        suspensionReason: "Suspicious telephony volume detected",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects suspension reason shorter than 5 characters", () => {
      const parsed = adminUpdateTenantSchema.safeParse({
        isActive: false,
        suspensionReason: "Bad",
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain(
          "at least 5 characters",
        );
      }
    });

    it("accepts updating name only", () => {
      const parsed = adminUpdateTenantSchema.safeParse({
        name: "Renamed Tenant Inc",
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe("GetTenantUseCase & GetTenantStatsUseCase", () => {
    it("fetches enriched tenant details including plan, wallet, and bolna key", async () => {
      const useCase = new GetTenantUseCase(mockRepo);
      const result = await useCase.execute("tenant-001");

      expect(result).toBeDefined();
      expect(result.tenantPlan?.plan.name).toBe("Enterprise Pro");
      expect(result.wallet?.cashBalance).toBe(450000);
      expect(result.bolnaApiKey?.keyIdentifier).toBe("bolna_live_****9912");
      // Must never expose encryptedKey
      expect((result.bolnaApiKey as any)?.encryptedKey).toBeUndefined();
    });

    it("fetches aggregated multi-dimensional tenant stats", async () => {
      const useCase = new GetTenantStatsUseCase(mockRepo);
      const result = await useCase.execute("tenant-001");

      expect(result.stats.financials.walletTotalBalance).toBe(500000);
      expect(result.stats.calls.completed).toBe(980);
      expect(result.stats.leads.dncCount).toBe(12);
      expect(result.stats.campaigns.running).toBe(2);
      expect(result.stats.batches.processing).toBe(1);
    });
  });
});
