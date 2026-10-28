import { type TenantEntityData } from "../../domain/tenant.entity";

export interface TenantWithCounts extends TenantEntityData {
  _count: {
    memberships: number;
    campaigns: number;
    leads: number;
    calls: number;
  };
  tenantPlan?: {
    id: string;
    status: string;
    onboardingFeeOverride: number | null;
    perMinuteRateOverride: number | null;
    activatedAt: Date | null;
    plan: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
    };
    planVersion: {
      id: string;
      version: number;
      status: string;
      currency: string;
      pricingModel: string;
      onboardingFee: number;
      perMinuteRate: number;
      billingMinimumSec: number;
      billingIncrementSec: number;
      maxActiveCampaigns: number | null;
      maxAgents: number | null;
      includedBalance: number;
      bonusValidityDays: number | null;
    };
  } | null;
  wallet?: {
    id: string;
    cashBalance: number;
    bonusBalance: number;
    bonusExpiresAt: Date | null;
    currency: string;
    isActive: boolean;
  } | null;
  bolnaApiKey?: {
    id: string;
    keyIdentifier: string;
    type: string;
    isActive: boolean;
    bolnaProfileName: string | null;
    bolnaProfileEmail: string | null;
    bolnaWalletBalance: number | null;
    bolnaConcurrencyMax: number | null;
    bolnaConcurrencyCurrent: number | null;
    bolnaProfileFetchedAt: Date | null;
  } | null;
}

export interface TenantStatsResult {
  tenant: TenantEntityData;
  stats: {
    totalUsers: number;
    totalLeads: number;
    totalCalls: number;
    completedCalls: number;
    activeCampaigns: number;
    users: {
      total: number;
    };
    financials: {
      walletCashBalance: number;
      walletBonusBalance: number;
      walletTotalBalance: number;
      totalRechargesCount: number;
      successfulRechargesCount: number;
      failedRechargesCount: number;
      totalRechargedAmountPaisa: number;
      customerChargedPaisa: number;
      platformCostPaisa: number;
    };
    calls: {
      total: number;
      completed: number;
      calling: number;
      pending: number;
      failed: number;
      busy: number;
      noAnswer: number;
      totalDurationSeconds: number;
      totalBillableSeconds: number;
    };
    campaigns: {
      total: number;
      running: number;
      draft: number;
      completed: number;
      failed: number;
    };
    batches: {
      total: number;
      processing: number;
      completed: number;
      failed: number;
    };
    leads: {
      total: number;
      pending: number;
      called: number;
      noAnswer: number;
      failed: number;
      dncCount: number;
    };
    assistants: {
      total: number;
    };
  };
}

export interface TenantRepository {
  list(): Promise<TenantWithCounts[]>;
  findById(id: string): Promise<TenantWithCounts | null>;
  update(
    id: string,
    data: {
      name?: string;
      isActive?: boolean;
      isVerified?: boolean;
      phone?: string | null;
      verifiedAt?: Date | null;
      suspensionReason?: string | null;
      suspendedAt?: Date | null;
      suspendedBy?: string | null;
    },
  ): Promise<TenantEntityData>;
  getStats(id: string): Promise<TenantStatsResult>;
}
