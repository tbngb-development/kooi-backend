// modules/campaigns/container.ts

import { PrismaCampaignRepository } from "./infrastructure/repositories/prisma-campaign.repository";
import { PrismaBatchRepository } from "../batches/infrastructure/repositories/prisma-batch.repository";
import { ListCampaignsUseCase } from "./application/use-cases/list-campaigns.use-case";
import { GetCampaignUseCase } from "./application/use-cases/get-campaign.use-case";
import { CreateCampaignUseCase } from "./application/use-cases/create-campaign.use-case";
import { ParseLeadsUseCase } from "./application/use-cases/parse-leads.use-case";
import { GetCampaignStatsUseCase } from "./application/use-cases/get-campaign-stats.use-case";
import { ExtractCampaignVariablesUseCase } from "./application/use-cases/extract-campaign-variables.use-case";
import { TenantCampaignController } from "./presentation/tenant-campaign.controller";
import { AdminCampaignController } from "./presentation/admin-campaign.controller";
import { PrismaPlanRepository } from "../plans/infrastructure/repositories/prisma-plan.repository";
import { PrismaWalletRepository } from "../wallet/infrastructure/repositories/prisma-wallet.repository";
import { GetCampaignExtractionOverviewUseCase } from "./application/use-cases/get-campaign-extraction-overview.use-case";
import { GetCampaignExtractionInsightsUseCase } from "./application/use-cases/get-campaign-extraction-insights.use-case";
import { GetCampaignCallMetricsUseCase } from "./application/use-cases/get-campaign-call-metrics.use-case";
import { ArchiveCampaignUseCase } from "./application/use-cases/archive-campaign.use-case";
import { RestoreCampaignUseCase } from "./application/use-cases/restore-campaign.use-case";
import { UpdateCampaignStatusUseCase } from "./application/use-cases/update-campaign-status.use-case";
import { UpdateCampaignUseCase } from "./application/use-cases/update-campaign.use-case";
import { ControlSarvamCampaignUseCase } from "./application/use-cases/control-sarvam-campaign.use-case";
import { SyncSarvamCampaignLifecycleUseCase } from "./application/use-cases/sync-sarvam-campaign-lifecycle.use-case";
import { ParseManualLeadsUseCase } from "./application/use-cases/parse-manual-leads.use-case";
import type { Logger } from "../../shared/logging/logger.interface";
import type { ITenantVoiceProviderService } from "../tenants/application/services/tenant-voice-provider.service";
import type { ISarvamCampaignClient } from "./infrastructure/clients/sarvam-campaign.client";
import type { ISarvamApiKeyEncryptionService } from "../sarvam-api-keys/application/interfaces/sarvam-api-key-encryption.interface";

export interface CampaignModuleDeps {
  logger: Logger;
  voiceProviderService?: ITenantVoiceProviderService;
  sarvamCampaignClient?: ISarvamCampaignClient;
  sarvamEncryptionService?: ISarvamApiKeyEncryptionService;
}

export interface CampaignModule {
  tenantController: TenantCampaignController;
  adminController: AdminCampaignController;
  repository: PrismaCampaignRepository;
  useCases: {
    controlSarvamCampaign?: ControlSarvamCampaignUseCase;
    syncSarvamCampaignLifecycle?: SyncSarvamCampaignLifecycleUseCase;
  };
}

export function buildCampaignModule(deps?: CampaignModuleDeps): CampaignModule {
  const campaignRepo = new PrismaCampaignRepository();
  const batchRepo = new PrismaBatchRepository();
  const planRepo = new PrismaPlanRepository();
  const walletRepo = new PrismaWalletRepository();
  const log = deps?.logger?.child({ module: "campaign" });

  const listCampaigns = new ListCampaignsUseCase(campaignRepo);
  const getCampaign = new GetCampaignUseCase(campaignRepo);
  const getCampaignStats = new GetCampaignStatsUseCase(campaignRepo);

  const parseLeads = new ParseLeadsUseCase(
    campaignRepo,
    batchRepo,
    planRepo,
    walletRepo,
    log,
  );

  const extractVariables = new ExtractCampaignVariablesUseCase(
    campaignRepo,
    log,
  );

  const getExtractionOverview = new GetCampaignExtractionOverviewUseCase(
    campaignRepo,
  );
  const getExtractionInsights = new GetCampaignExtractionInsightsUseCase(
    campaignRepo,
  );
  const getCampaignCallMetrics = new GetCampaignCallMetricsUseCase(
    campaignRepo,
  );

  const parseManualLeads = new ParseManualLeadsUseCase(parseLeads);

  const archiveCampaign = new ArchiveCampaignUseCase(campaignRepo);
  const restoreCampaign = new RestoreCampaignUseCase(campaignRepo);
  const updateCampaignStatus = new UpdateCampaignStatusUseCase(
    campaignRepo,
    batchRepo,
    log,
  );
  const updateCampaign = new UpdateCampaignUseCase(
    campaignRepo,
    log,
  );

  const controlSarvamCampaign =
    deps?.sarvamCampaignClient && deps?.sarvamEncryptionService
      ? new ControlSarvamCampaignUseCase(
          campaignRepo,
          batchRepo,
          deps.sarvamCampaignClient,
          deps.sarvamEncryptionService,
          log,
        )
      : undefined;

  const syncSarvamCampaignLifecycle =
    deps?.sarvamCampaignClient && deps?.sarvamEncryptionService
      ? new SyncSarvamCampaignLifecycleUseCase(
          campaignRepo,
          batchRepo,
          deps.sarvamCampaignClient,
          deps.sarvamEncryptionService,
          log,
        )
      : undefined;

  const createCampaign = new CreateCampaignUseCase(
    campaignRepo,
    planRepo,
    deps?.voiceProviderService,
    deps?.sarvamCampaignClient,
    deps?.sarvamEncryptionService,
    log,
  );

  return {
    repository: campaignRepo,
    useCases: {
      controlSarvamCampaign,
      syncSarvamCampaignLifecycle,
    },
    tenantController: new TenantCampaignController(
      listCampaigns,
      getCampaign,
      createCampaign,
      new ParseLeadsUseCase(campaignRepo, batchRepo, planRepo, walletRepo, log),
      getCampaignStats,
      extractVariables,
      getExtractionOverview,
      getExtractionInsights,
      getCampaignCallMetrics,
      archiveCampaign,
      parseManualLeads,
    ),
    adminController: new AdminCampaignController(
      listCampaigns,
      getCampaign,
      getCampaignStats,
      archiveCampaign,
      restoreCampaign,
      updateCampaignStatus,
      updateCampaign,
    ),
  };
}
