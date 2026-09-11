import { PrismaPlanRepository } from "./infrastructure/repositories/prisma-plan.repository";
import type { PlanRepository } from "./application/interfaces/plan-repository.interface";
import { ListPlansUseCase } from "./application/use-cases/list-plans.use-case";
import { GetPlanUseCase } from "./application/use-cases/get-plan.use-case";
import { GetTenantPlanUseCase } from "./application/use-cases/get-tenant-plan.use-case";
import { CreatePlanUseCase } from "./application/use-cases/create-plan.use-case";
import { UpdatePlanUseCase } from "./application/use-cases/update-plan.use-case";
import { CreatePlanVersionUseCase } from "./application/use-cases/create-plan-version.use-case";
import { PublishPlanVersionUseCase } from "./application/use-cases/publish-plan-version.use-case";
import { ArchivePlanVersionUseCase } from "./application/use-cases/archive-plan-version.use-case";
import { ActivateTenantPlanUseCase } from "./application/use-cases/activate-tenant-plan.use-case";
import { SelectPlanUseCase } from "./application/use-cases/select-plan.use-case";
import { UpdateTenantPlanOverridesUseCase } from "./application/use-cases/update-tenant-plan-overrides.use-case";
import { AdminPlanController } from "./presentation/admin-plan.controller";
import { TenantPlanController } from "./presentation/tenant-plan.controller";
import { ChangeTenantPlanUseCase } from "./application/use-cases/change-tenant-plan.use-case";

export interface PlanModule {
  repository: PlanRepository;
  useCases: {
    activateTenantPlan: ActivateTenantPlanUseCase;
    selectPlan: SelectPlanUseCase;
    getTenantPlan: GetTenantPlanUseCase;
    updateTenantPlanOverrides: UpdateTenantPlanOverridesUseCase;
  };
  adminController: AdminPlanController;
  tenantController: TenantPlanController;
}

export function buildPlanModule(): PlanModule {
  const repository = new PrismaPlanRepository();

  const listPlans = new ListPlansUseCase(repository);
  const getPlan = new GetPlanUseCase(repository);
  const getTenantPlan = new GetTenantPlanUseCase(repository);
  const createPlan = new CreatePlanUseCase(repository);
  const updatePlan = new UpdatePlanUseCase(repository);
  const createPlanVersion = new CreatePlanVersionUseCase(repository);
  const publishPlanVersion = new PublishPlanVersionUseCase(repository);
  const archivePlanVersion = new ArchivePlanVersionUseCase(repository);
  const activateTenantPlan = new ActivateTenantPlanUseCase(repository);
  const selectPlan = new SelectPlanUseCase(repository);
  const updateTenantPlanOverrides = new UpdateTenantPlanOverridesUseCase(
    repository,
  );
  const changeTenantPlan = new ChangeTenantPlanUseCase(repository);

  return {
    repository,
    useCases: {
      activateTenantPlan,
      selectPlan,
      getTenantPlan,
      updateTenantPlanOverrides,
    },
    adminController: new AdminPlanController(
      listPlans,
      getPlan,
      createPlan,
      updatePlan,
      createPlanVersion,
      publishPlanVersion,
      archivePlanVersion,
      updateTenantPlanOverrides,
      changeTenantPlan,
    ),
    tenantController: new TenantPlanController(
      listPlans,
      getTenantPlan,
      selectPlan,
      changeTenantPlan,
    ),
  };
}
