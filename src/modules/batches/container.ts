import { PrismaBatchRepository } from "./infrastructure/repositories/prisma-batch.repository";
import { PrismaCampaignRepository } from "../campaigns/infrastructure/repositories/prisma-campaign.repository";
import { BolnaBatchProviderImpl } from "./infrastructure/bolna-batch-provider";
import { CloudinaryStorageProvider } from "../../shared/config/external/storage/cloudinary.storage";
import { ListBatchesUseCase } from "./application/use-cases/list-batches.use-case";
import { GetBatchUseCase } from "./application/use-cases/get-batch.use-case";
import { CreateBatchUseCase } from "./application/use-cases/create-batch.use-case";
import { RunBatchUseCase } from "./application/use-cases/run-batch.use-case";
import { ScheduleBatchUseCase } from "./application/use-cases/schedule-batch.use-case";
import { StopBatchUseCase } from "./application/use-cases/stop-batch.use-case";
import { ResumeBatchUseCase } from "./application/use-cases/resume-batch.use-case";
import { DeleteBatchUseCase } from "./application/use-cases/delete-batch.use-case";
import { GetBatchStatsUseCase } from "./application/use-cases/get-batch-stats.use-case";
import { TenantBatchController } from "./presentation/tenant-batch.controller";
import { AdminBatchController } from "./presentation/admin-batch.controller";
import type { IBolnaClientFactory } from "../../shared/config/external/bolna/bolna-client.factory";
import type { CheckBalanceForBatchUseCase } from "../wallet/application/use-cases/check-balance-for-batch.use-case";
import { PrismaPlanRepository } from "../plans/infrastructure/repositories/prisma-plan.repository";

export interface BatchModuleDeps {
  bolnaClientFactory: IBolnaClientFactory;
  checkBalanceForBatch?: CheckBalanceForBatchUseCase;
}

export interface BatchModule {
  tenantController: TenantBatchController;
  adminController: AdminBatchController;
}

export function buildBatchModule(deps: BatchModuleDeps): BatchModule {
  const batchRepo = new PrismaBatchRepository();
  const campaignRepo = new PrismaCampaignRepository();
  const storage = new CloudinaryStorageProvider();
  const bolnaProvider = new BolnaBatchProviderImpl(deps.bolnaClientFactory);

  const listBatches = new ListBatchesUseCase(batchRepo, campaignRepo);
  const getBatch = new GetBatchUseCase(batchRepo);
  const getBatchStats = new GetBatchStatsUseCase(batchRepo);
  const planRepo = new PrismaPlanRepository();

  return {
    tenantController: new TenantBatchController(
      listBatches,
      getBatch,
      new CreateBatchUseCase(batchRepo, campaignRepo, storage, bolnaProvider),
      new RunBatchUseCase(
        batchRepo,
        campaignRepo,
        bolnaProvider,
        planRepo,
        deps.checkBalanceForBatch,
      ),
      new ScheduleBatchUseCase(
        batchRepo,
        campaignRepo,
        bolnaProvider,
        planRepo,
        deps.checkBalanceForBatch,
      ),
      new StopBatchUseCase(batchRepo, campaignRepo, bolnaProvider),
      new ResumeBatchUseCase(batchRepo, campaignRepo, storage, bolnaProvider),
      new DeleteBatchUseCase(batchRepo, bolnaProvider),
      getBatchStats,
    ),
    adminController: new AdminBatchController(
      listBatches,
      getBatch,
      getBatchStats,
    ),
  };
}
