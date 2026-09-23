import { type TenantEntityData } from "../../domain/tenant.entity";

export interface TenantWithCounts extends TenantEntityData {
  _count: {
    memberships: number;
    campaigns: number;
    leads: number;
    calls: number;
  };
}

export interface TenantStatsResult {
  tenant: TenantEntityData;
  stats: {
    totalUsers: number;
    totalLeads: number;
    totalCalls: number;
    completedCalls: number;
    activeCampaigns: number;
  };
}

export interface TenantRepository {
  list(): Promise<TenantWithCounts[]>;
  findById(id: string): Promise<TenantWithCounts | null>;
  update(
    id: string,
    data: { name?: string; isActive?: boolean },
  ): Promise<TenantEntityData>;
  getStats(id: string): Promise<TenantStatsResult>;
}
