import { PrismaTenantRepository } from "./infrastructure/repositories/prisma-tenant.repository";
import { ListTenantsUseCase } from "./application/use-cases/list-tenants.use-case";
import { GetTenantUseCase } from "./application/use-cases/get-tenant.use-case";
import { UpdateTenantUseCase } from "./application/use-cases/update-tenant.use-case";
import { GetTenantStatsUseCase } from "./application/use-cases/get-tenant-stats.use-case";
import { TenantWorkspaceController } from "./presentation/tenant-workspace.controller";
import { AdminTenantController } from "./presentation/admin-tenant.controller";

export interface TenantModule {
  workspaceController: TenantWorkspaceController;
  adminController: AdminTenantController;
}

export function buildTenantModule(): TenantModule {
  const repository = new PrismaTenantRepository();
  const getTenant = new GetTenantUseCase(repository);
  const updateTenant = new UpdateTenantUseCase(repository);
  const getTenantStats = new GetTenantStatsUseCase(repository);

  return {
    workspaceController: new TenantWorkspaceController(
      getTenant,
      updateTenant,
      getTenantStats,
    ),
    adminController: new AdminTenantController(
      new ListTenantsUseCase(repository),
      getTenant,
      updateTenant,
      getTenantStats,
    ),
  };
}
