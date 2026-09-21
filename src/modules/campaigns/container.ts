import { PrismaCampaignRepository } from "./infrastructure/repositories/prisma-campaign.repository";
import { PrismaBatchRepository } from "../batches/infrastructure/repositories/prisma-batch.repository";
import { ListCampaignsUseCase } from "./application/use-cases/list-campaigns.use-case";
import { GetCampaignUseCase } from "./application/use-cases/get-campaign.use-case";
import { CreateCampaignUseCase } from "./application/use-cases/create-campaign.use-case";
import { ParseLeadsUseCase } from "./application/use-cases/parse-leads.use-case";
import { GetCampaignStatsUseCase } from "./application/use-cases/get-campaign-stats.use-case";
import { GetCampaignPerformanceUseCase } from "./application/use-cases/get-campaign-performance.use-case";
import { GetCampaignPerformanceV2UseCase } from "./application/use-cases/get-campaign-performance-v2.use-case";
import { ExtractCampaignVariablesUseCase } from "./application/use-cases/extract-campaign-variables.use-case";
import { TenantCampaignController } from "./presentation/tenant-campaign.controller";
import { AdminCampaignController } from "./presentation/admin-campaign.controller";
import { PrismaPlanRepository } from "../plans/infrastructure/repositories/prisma-plan.repository";
import { PrismaWalletRepository } from "../wallet/infrastructure/repositories/prisma-wallet.repository";
import { GetCampaignExtractionOverviewUseCase } from "./application/use-cases/get-campaign-extraction-overview.use-case";

export interface CampaignModule {
  tenantController: TenantCampaignController;
  adminController: AdminCampaignController;
}

export function buildCampaignModule(): CampaignModule {
  const campaignRepo = new PrismaCampaignRepository();
  const batchRepo = new PrismaBatchRepository();
  const planRepo = new PrismaPlanRepository();
  const walletRepo = new PrismaWalletRepository();

  const listCampaigns = new ListCampaignsUseCase(campaignRepo);
  const getCampaign = new GetCampaignUseCase(campaignRepo);
  const getCampaignStats = new GetCampaignStatsUseCase(campaignRepo);
  const getCampaignPerformance = new GetCampaignPerformanceUseCase(
    campaignRepo,
  );
  const getCampaignPerformanceV2 = new GetCampaignPerformanceV2UseCase(
    campaignRepo,
  );
  const extractVariables = new ExtractCampaignVariablesUseCase(campaignRepo);

  const getExtractionOverview = new GetCampaignExtractionOverviewUseCase(
    campaignRepo,
  );

  return {
    tenantController: new TenantCampaignController(
      listCampaigns,
      getCampaign,
      new CreateCampaignUseCase(campaignRepo, planRepo),
      new ParseLeadsUseCase(campaignRepo, batchRepo, planRepo, walletRepo),
      getCampaignStats,
      getCampaignPerformance,
      getCampaignPerformanceV2,
      extractVariables,
      getExtractionOverview,
    ),
    adminController: new AdminCampaignController(
      listCampaigns,
      getCampaign,
      getCampaignStats,
      getCampaignPerformance,
      getCampaignPerformanceV2,
    ),
  };
}
