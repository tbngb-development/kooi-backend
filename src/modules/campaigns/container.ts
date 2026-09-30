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
import type { Logger } from "../../shared/logging/logger.interface";

export interface CampaignModuleDeps {
  logger: Logger;
}

export interface CampaignModule {
  tenantController: TenantCampaignController;
  adminController: AdminCampaignController;
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

  return {
    tenantController: new TenantCampaignController(
      listCampaigns,
      getCampaign,
      new CreateCampaignUseCase(campaignRepo, planRepo, log),
      new ParseLeadsUseCase(campaignRepo, batchRepo, planRepo, walletRepo, log),
      getCampaignStats,
      extractVariables,
      getExtractionOverview,
      getExtractionInsights,
    ),
    adminController: new AdminCampaignController(
      listCampaigns,
      getCampaign,
      getCampaignStats,
    ),
  };
}
