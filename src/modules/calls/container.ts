// modules/calls/container.ts

import { PrismaCallRepository } from "./infrastructure/repositories/prisma-call.repository";
import { ListCallsUseCase } from "./application/use-cases/list-calls.use-case";
import { GetCallUseCase } from "./application/use-cases/get-call.use-case";
import { GetCallTranscriptUseCase } from "./application/use-cases/get-call-transcript.use-case";
import { GetCallStatsUseCase } from "./application/use-cases/get-call-stats.use-case";
import { TenantCallController } from "./presentation/tenant-call.controller";
import { AdminCallController } from "./presentation/admin-call.controller";
import { GetAvailableFiltersUseCase } from "./application/use-cases/get-available-filters.use-case";
import { ArchiveCallUseCase } from "./application/use-cases/archive-call.use-case";
import { RestoreCallUseCase } from "./application/use-cases/restore-call.use-case";
import { InboundCallerMatchUseCase } from "./application/use-cases/inbound-caller-match.use-case";
import { InboundCallerMatchController } from "./presentation/inbound-caller-match.controller";
import type { Logger } from "../../shared/logging/logger.interface";

export interface CallModuleDeps {
  logger: Logger;
}
export interface CallModule {
  adminController: AdminCallController;
  tenantController: TenantCallController;
  inboundCallerController: InboundCallerMatchController;
}

export function buildCallModule(deps: CallModuleDeps): CallModule {
  const repo = new PrismaCallRepository();
  const log = deps.logger.child({ module: "call" });
  const listCalls = new ListCallsUseCase(repo);
  const getCall = new GetCallUseCase(repo);
  const getTranscript = new GetCallTranscriptUseCase(repo);
  const getStats = new GetCallStatsUseCase(repo);
  const getAvailableFilters = new GetAvailableFiltersUseCase(repo);

  const archiveCall = new ArchiveCallUseCase(repo);
  const restoreCall = new RestoreCallUseCase(repo);

  const inboundCallerMatch = new InboundCallerMatchUseCase(repo, log);
  const inboundCallerMatchController = new InboundCallerMatchController(
    inboundCallerMatch,
  );

  return {
    tenantController: new TenantCallController(
      listCalls,
      getCall,
      getTranscript,
      getStats,
      getAvailableFilters,
      archiveCall,
    ),
    adminController: new AdminCallController(
      listCalls,
      getCall,
      getTranscript,
      getStats,
      getAvailableFilters,
      archiveCall,
      restoreCall,
    ),
    inboundCallerController: inboundCallerMatchController,
  };
}
