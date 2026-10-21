// modules/calls/container.ts

import { PrismaCallRepository } from "./infrastructure/repositories/prisma-call.repository";
import { ListCallsUseCase } from "./application/use-cases/list-calls.use-case";
import { GetCallUseCase } from "./application/use-cases/get-call.use-case";
import { GetCallTranscriptUseCase } from "./application/use-cases/get-call-transcript.use-case";
import { GetCallStatsUseCase } from "./application/use-cases/get-call-stats.use-case";
import { GetCallCenterStatsUseCase } from "./application/use-cases/get-call-center-stats.use-case";
import { TenantCallController } from "./presentation/tenant-call.controller";
import { AdminCallController } from "./presentation/admin-call.controller";
import { GetAvailableFiltersUseCase } from "./application/use-cases/get-available-filters.use-case";
import { ArchiveCallUseCase } from "./application/use-cases/archive-call.use-case";
import { RestoreCallUseCase } from "./application/use-cases/restore-call.use-case";
import { InboundCallerMatchUseCase } from "./application/use-cases/inbound-caller-match.use-case";
import { InboundCallerMatchController } from "./presentation/inbound-caller-match.controller";
import { SyncBolnaExecutionUseCase } from "./application/use-cases/sync-bolna-execution.use-case";
import { QuickDialCallUseCase } from "./application/use-cases/quick-dial-call.use-case";
import { StopCallUseCase } from "./application/use-cases/stop-call.use-case";
import type { IBolnaClientFactory } from "../../shared/config/external/bolna/bolna-client.factory";
import type { WalletRepository } from "../wallet/application/interfaces/wallet-repository.interface";
import type { DebitWalletForCallUseCase } from "../wallet/application/use-cases/debit-wallet.use-case";
import type { Queue } from "bull";
import type { Logger } from "../../shared/logging/logger.interface";
import { PrismaLeadRepository } from "../leads/infrastructure/repositories/prisma-lead.repository";
import { PrismaAssistantRepository } from "../assistants/infrastructure/repositories/prisma-assistant.repository";
import { PrismaPhoneNumberRepository } from "../phone-numbers/infrastructure/repositories/prisma-phone-number.repository";

export interface CallModuleDeps {
  bolnaClientFactory: IBolnaClientFactory;
  walletRepo: WalletRepository;
  debitWalletForCall?: DebitWalletForCallUseCase;
  classifierQueue?: Queue;
  logger: Logger;
}

export interface CallModule {
  adminController: AdminCallController;
  tenantController: TenantCallController;
  inboundCallerController: InboundCallerMatchController;
}

export function buildCallModule(deps: CallModuleDeps): CallModule {
  const callRepo = new PrismaCallRepository();
  const leadRepo = new PrismaLeadRepository();
  const assistantRepo = new PrismaAssistantRepository();
  const phoneNumberRepo = new PrismaPhoneNumberRepository();
  const log = deps.logger.child({ module: "call" });
  const listCalls = new ListCallsUseCase(callRepo);
  const getCall = new GetCallUseCase(callRepo);
  const getTranscript = new GetCallTranscriptUseCase(callRepo);
  const getStats = new GetCallStatsUseCase(callRepo);
  const getCallCenterStats = new GetCallCenterStatsUseCase(callRepo);
  const getAvailableFilters = new GetAvailableFiltersUseCase(callRepo);

  const archiveCall = new ArchiveCallUseCase(callRepo);
  const restoreCall = new RestoreCallUseCase(callRepo);

  const quickDialCall = new QuickDialCallUseCase(
    deps.bolnaClientFactory,
    deps.walletRepo,
    assistantRepo,
    leadRepo,
    callRepo,
    phoneNumberRepo,
    log,
  );
  const stopCall = new StopCallUseCase(deps.bolnaClientFactory, log);

  const inboundCallerMatch = new InboundCallerMatchUseCase(
    assistantRepo,
    leadRepo,
    callRepo,
    log,
  );
  const inboundCallerMatchController = new InboundCallerMatchController(
    inboundCallerMatch,
  );

  const syncBolnaExecution = new SyncBolnaExecutionUseCase(
    deps.bolnaClientFactory,
    deps.debitWalletForCall,
    deps.classifierQueue,
    log,
  );

  return {
    tenantController: new TenantCallController(
      listCalls,
      getCall,
      getTranscript,
      getStats,
      getCallCenterStats,
      getAvailableFilters,
      archiveCall,
      quickDialCall,
      stopCall,
    ),
    adminController: new AdminCallController(
      listCalls,
      getCall,
      getTranscript,
      getStats,
      getAvailableFilters,
      archiveCall,
      restoreCall,
      syncBolnaExecution,
    ),
    inboundCallerController: inboundCallerMatchController,
  };
}
