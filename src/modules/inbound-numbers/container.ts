import type { Router } from "express";
import { PrismaInboundNumberRepository } from "./infrastructure/repositories/prisma-inbound-number.repository";
import { InboundNumberSyncWorker } from "./infrastructure/jobs/inbound-number-sync.worker";
import { InboundNumberSyncScheduler } from "./infrastructure/jobs/inbound-number-sync.scheduler";
import { ImportInboundNumbersUseCase } from "./application/use-cases/admin/import-inbound-numbers.use-case";
import { CreateCustomInboundNumberUseCase } from "./application/use-cases/admin/create-custom-inbound-number.use-case";
import { AssignInboundNumberUseCase } from "./application/use-cases/admin/assign-inbound-number.use-case";
import { SuspendInboundNumberUseCase } from "./application/use-cases/admin/suspend-inbound-number.use-case";
import { ReactivateInboundNumberUseCase } from "./application/use-cases/admin/reactivate-inbound-number.use-case";
import { ReleaseInboundNumberUseCase } from "./application/use-cases/admin/release-inbound-number.use-case";
import { RetryProviderSyncUseCase } from "./application/use-cases/admin/retry-provider-sync.use-case";
import { ListInboundNumbersUseCase } from "./application/use-cases/admin/list-inbound-numbers.use-case";
import { GetInboundNumberUseCase } from "./application/use-cases/admin/get-inbound-number.use-case";
import { ListTenantInboundNumbersUseCase } from "./application/use-cases/tenant/list-tenant-inbound-numbers.use-case";
import { GetTenantInboundNumberUseCase } from "./application/use-cases/tenant/get-tenant-inbound-number.use-case";
import { BillInboundNumberRentalsUseCase } from "./application/use-cases/billing/bill-inbound-number-rentals.use-case";
import { AdminInboundNumberController } from "./presentation/admin-inbound-number.controller";
import { TenantInboundNumberController } from "./presentation/tenant-inbound-number.controller";
import { buildAdminInboundNumberRoutes } from "./presentation/admin-inbound-number.routes";
import { buildTenantInboundNumberRoutes } from "./presentation/tenant-inbound-number.routes";
import type { IBolnaClientFactory } from "../../shared/config/external/bolna/bolna-client.factory";
import type { WalletRepository } from "../wallet/application/interfaces/wallet-repository.interface";
import type { AuthenticateMiddleware } from "../../shared/middleware/authenticate";
import type { AuthorizeMiddleware } from "../../shared/middleware/authorize";
import type { Logger } from "../../shared/logging/logger.interface";

export interface InboundNumbersModuleDeps {
  bolnaClientFactory: IBolnaClientFactory;
  walletRepo: WalletRepository;
  authenticate: AuthenticateMiddleware;
  authorize: AuthorizeMiddleware;
  logger?: Logger;
}

export interface InboundNumbersModule {
  adminRouter: Router;
  tenantRouter: Router;
  syncScheduler: InboundNumberSyncScheduler;
  billRentalsUseCase: BillInboundNumberRentalsUseCase;
  repository: PrismaInboundNumberRepository;
}

export function createInboundNumbersModule(
  deps: InboundNumbersModuleDeps,
): InboundNumbersModule {
  const repository = new PrismaInboundNumberRepository();

  const worker = new InboundNumberSyncWorker(
    repository,
    deps.bolnaClientFactory,
    deps.logger,
  );

  const syncScheduler = new InboundNumberSyncScheduler(worker, deps.logger);
  syncScheduler.start();

  const importInboundNumbersUseCase = new ImportInboundNumbersUseCase(
    repository,
    deps.bolnaClientFactory,
    deps.logger,
  );

  const createCustomInboundNumberUseCase = new CreateCustomInboundNumberUseCase(
    repository,
    deps.logger,
  );

  const assignInboundNumberUseCase = new AssignInboundNumberUseCase(
    repository,
    syncScheduler,
    deps.logger,
  );

  const suspendInboundNumberUseCase = new SuspendInboundNumberUseCase(
    repository,
    syncScheduler,
    deps.logger,
  );

  const reactivateInboundNumberUseCase = new ReactivateInboundNumberUseCase(
    repository,
    syncScheduler,
    deps.logger,
  );

  const releaseInboundNumberUseCase = new ReleaseInboundNumberUseCase(
    repository,
    syncScheduler,
    deps.logger,
  );

  const retryProviderSyncUseCase = new RetryProviderSyncUseCase(
    repository,
    syncScheduler,
    deps.logger,
  );

  const listInboundNumbersUseCase = new ListInboundNumbersUseCase(repository);
  const getInboundNumberUseCase = new GetInboundNumberUseCase(repository);

  const listTenantInboundNumbersUseCase = new ListTenantInboundNumbersUseCase(
    repository,
  );
  const getTenantInboundNumberUseCase = new GetTenantInboundNumberUseCase(
    repository,
  );

  const billRentalsUseCase = new BillInboundNumberRentalsUseCase(
    repository,
    deps.walletRepo,
    syncScheduler,
    deps.logger,
  );

  const adminController = new AdminInboundNumberController(
    listInboundNumbersUseCase,
    getInboundNumberUseCase,
    importInboundNumbersUseCase,
    createCustomInboundNumberUseCase,
    assignInboundNumberUseCase,
    suspendInboundNumberUseCase,
    reactivateInboundNumberUseCase,
    releaseInboundNumberUseCase,
    retryProviderSyncUseCase,
    billRentalsUseCase,
  );

  const tenantController = new TenantInboundNumberController(
    listTenantInboundNumbersUseCase,
    getTenantInboundNumberUseCase,
  );

  const adminRouter = buildAdminInboundNumberRoutes(
    adminController,
    deps.authenticate,
    deps.authorize,
  );

  const tenantRouter = buildTenantInboundNumberRoutes(
    tenantController,
    deps.authenticate,
  );

  return {
    adminRouter,
    tenantRouter,
    syncScheduler,
    billRentalsUseCase,
    repository,
  };
}
