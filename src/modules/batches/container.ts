// modules/batches/container.ts

import { PrismaBatchRepository } from "./infrastructure/repositories/prisma-batch.repository";
import { PrismaCampaignRepository } from "../campaigns/infrastructure/repositories/prisma-campaign.repository";
import { BolnaBatchProviderImpl } from "./infrastructure/bolna-batch-provider";
import { CloudinaryStorageProvider } from "../../shared/config/external/storage/cloudinary.storage";
import { ListBatchesUseCase } from "./application/use-cases/list-batches.use-case";
import { GetBatchUseCase } from "./application/use-cases/get-batch.use-case";
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
import type { Logger } from "../../shared/logging/logger.interface";
import { BatchProcessingScheduler } from "./infrastructure/jobs/batch-processing.scheduler";
import { EnqueueBatchUploadUseCase } from "./application/use-cases/enqueue-batch-upload.use-case";
import { BatchProcessingWorker } from "./infrastructure/jobs/batch-processing.worker";
import { ArchiveBatchUseCase } from "./application/use-cases/archive-batch.use-case";
import { RestoreBatchUseCase } from "./application/use-cases/restore-batch.use-case";

export interface BatchModuleDeps {
  bolnaClientFactory: IBolnaClientFactory;
  checkBalanceForBatch?: CheckBalanceForBatchUseCase;
  logger?: Logger;
}

export interface BatchModule {
  tenantController: TenantBatchController;
  adminController: AdminBatchController;
  schedulers: { batchProcessing: BatchProcessingScheduler };
}

export function buildBatchModule(deps: BatchModuleDeps): BatchModule {
  const batchRepo = new PrismaBatchRepository();
  const campaignRepo = new PrismaCampaignRepository();
  const log = deps.logger?.child({ module: "batch" });
  const storage = new CloudinaryStorageProvider(
    log?.child({ module: "cloudinary" }),
  );
  const bolnaProvider = new BolnaBatchProviderImpl(deps.bolnaClientFactory);
  const planRepo = new PrismaPlanRepository();

  const listBatches = new ListBatchesUseCase(batchRepo, campaignRepo);
  const getBatch = new GetBatchUseCase(batchRepo);
  const getBatchStats = new GetBatchStatsUseCase(batchRepo);
  const archiveBatch = new ArchiveBatchUseCase(batchRepo);
  const restoreBatch = new RestoreBatchUseCase(batchRepo);

  const enqueueBatchUpload = new EnqueueBatchUploadUseCase(
    batchRepo,
    campaignRepo,
    planRepo,
    storage,
    log,
  );

  const worker = new BatchProcessingWorker(
    batchRepo,
    campaignRepo,
    planRepo,
    bolnaProvider,
    log,
  );

  const batchProcessingScheduler = new BatchProcessingScheduler(worker, log);

  return {
    tenantController: new TenantBatchController(
      listBatches,
      getBatch,
      enqueueBatchUpload,
      new RunBatchUseCase(
        batchRepo,
        campaignRepo,
        bolnaProvider,
        planRepo,
        deps.checkBalanceForBatch,
        log,
      ),
      new ScheduleBatchUseCase(
        batchRepo,
        campaignRepo,
        bolnaProvider,
        planRepo,
        deps.checkBalanceForBatch,
        log,
      ),
      new StopBatchUseCase(batchRepo, campaignRepo, bolnaProvider, log),
      new ResumeBatchUseCase(
        batchRepo,
        campaignRepo,
        storage,
        bolnaProvider,
        log,
      ),
      new DeleteBatchUseCase(batchRepo, bolnaProvider, log),
      getBatchStats,
      archiveBatch,
    ),
    adminController: new AdminBatchController(
      listBatches,
      getBatch,
      getBatchStats,
      archiveBatch,
      restoreBatch,
    ),
    schedulers: { batchProcessing: batchProcessingScheduler },
  };
}
