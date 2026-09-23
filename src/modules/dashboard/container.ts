import { PrismaDashboardRepository } from "./infrastructure/repositories/prisma-dashboard.repository";
import { PrismaAdminDashboardRepository } from "./infrastructure/repositories/prisma-admin-dashboard.repository";

import { GetDashboardOverviewUseCase } from "./application/use-cases/get-dashboard-overview.use-case";
import { GetCallTrendsUseCase } from "./application/use-cases/get-call-trends.use-case";
import { GetSpendTrendsUseCase } from "./application/use-cases/get-spend-trends.use-case";
import { GetLeadFunnelUseCase } from "./application/use-cases/get-lead-funnel.use-case";

import { GetAdminOverviewUseCase } from "./application/use-cases/get-admin-overview.use-case";
import { GetRevenueTrendsUseCase } from "./application/use-cases/get-revenue-trends.use-case";
import { GetPlatformCallTrendsUseCase } from "./application/use-cases/get-platform-call-trends.use-case";
import { GetTenantDistributionUseCase } from "./application/use-cases/get-tenant-distribution.use-case";
import { GetTopTenantsUseCase } from "./application/use-cases/get-top-tenants.use-case";

import { TenantDashboardController } from "./presentation/tenant-dashboard.controller";
import { AdminDashboardController } from "./presentation/admin-dashboard.controller";

export interface DashboardModule {
  tenantController: TenantDashboardController;
  adminController: AdminDashboardController;
}

export function buildDashboardModule(): DashboardModule {
  const tenantRepo = new PrismaDashboardRepository();
  const adminRepo = new PrismaAdminDashboardRepository();

  return {
    tenantController: new TenantDashboardController(
      new GetDashboardOverviewUseCase(tenantRepo),
      new GetCallTrendsUseCase(tenantRepo),
      new GetSpendTrendsUseCase(tenantRepo),
      new GetLeadFunnelUseCase(tenantRepo),
    ),
    adminController: new AdminDashboardController(
      new GetAdminOverviewUseCase(adminRepo),
      new GetRevenueTrendsUseCase(adminRepo),
      new GetPlatformCallTrendsUseCase(adminRepo),
      new GetTenantDistributionUseCase(adminRepo),
      new GetTopTenantsUseCase(adminRepo),
    ),
  };
}
