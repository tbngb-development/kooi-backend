import { PrismaBolnaApiKeyRepository } from "./infrastructure/repositories/prisma-bolna-api-key.repository";
import type { BolnaApiKeyRepository } from "./application/interfaces/bolna-api-key-repository.interface";
import { CreateBolnaApiKeyUseCase } from "./application/use-cases/create-bolna-api-key.use-case";
import { ListBolnaApiKeysUseCase } from "./application/use-cases/list-bolna-api-keys.use-case";
import { AssignKeyToTenantUseCase } from "./application/use-cases/assign-key-to-tenant.use-case";
import { AutoAssignKeyUseCase } from "./application/use-cases/auto-assign-key.use-case";
import { DeactivateBolnaApiKeyUseCase } from "./application/use-cases/deactivate-bolna-api-key.use-case";
import { AdminBolnaApiKeyController } from "./presentation/admin-bolna-api-key.controller";

export interface BolnaApiKeyModule {
  repository: BolnaApiKeyRepository;
  useCases: {
    autoAssignKey: AutoAssignKeyUseCase;
  };
  adminController: AdminBolnaApiKeyController;
}

export function buildBolnaApiKeyModule(): BolnaApiKeyModule {
  const repository = new PrismaBolnaApiKeyRepository();

  return {
    repository,
    useCases: {
      autoAssignKey: new AutoAssignKeyUseCase(repository),
    },
    adminController: new AdminBolnaApiKeyController(
      new CreateBolnaApiKeyUseCase(repository),
      new ListBolnaApiKeysUseCase(repository),
      new AssignKeyToTenantUseCase(repository),
      new DeactivateBolnaApiKeyUseCase(repository),
    ),
  };
}
