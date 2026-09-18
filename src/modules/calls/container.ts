import { PrismaCallRepository } from "./infrastructure/repositories/prisma-call.repository";
import { ListCallsUseCase } from "./application/use-cases/list-calls.use-case";
import { GetCallUseCase } from "./application/use-cases/get-call.use-case";
import { GetCallTranscriptUseCase } from "./application/use-cases/get-call-transcript.use-case";
import { GetCallStatsUseCase } from "./application/use-cases/get-call-stats.use-case";
import { TenantCallController } from "./presentation/tenant-call.controller";
import { AdminCallController } from "./presentation/admin-call.controller";
import { GetCallExtractionResponseUseCase } from "./application/use-cases/get-call-extraction-response.use-case";
import { GetAvailableFiltersUseCase } from "./application/use-cases/get-available-filters.use-case";

export interface CallModule {
  adminController: AdminCallController;
  tenantController: TenantCallController;
}

export function buildCallModule(): CallModule {
  const repo = new PrismaCallRepository();
  const listCalls = new ListCallsUseCase(repo);
  const getCall = new GetCallUseCase(repo);
  const getTranscript = new GetCallTranscriptUseCase(repo);
  const getStats = new GetCallStatsUseCase(repo);
  const getCallExtractionResponseUseCase = new GetCallExtractionResponseUseCase(
    repo,
  );
  const getAvailableFilters = new GetAvailableFiltersUseCase(repo);

  return {
    tenantController: new TenantCallController(
      listCalls,
      getCall,
      getTranscript,
      getStats,
      getCallExtractionResponseUseCase,
      getAvailableFilters,
    ),
    adminController: new AdminCallController(
      listCalls,
      getCall,
      getTranscript,
      getStats,
      getCallExtractionResponseUseCase,
      getAvailableFilters,
    ),
  };
}
