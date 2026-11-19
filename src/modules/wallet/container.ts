import prisma from "../../shared/config/database/prisma";
import { PrismaWalletRepository } from "./infrastructure/repositories/prisma-wallet.repository";
import { PrismaWalletIncidentStateRepository } from "./infrastructure/repositories/prisma-wallet-incident-state.repository";
import { NoopCampaignStopAdapter } from "./infrastructure/adapters/noop-campaign-stop.adapter";
import type { WalletRepository } from "./application/interfaces/wallet-repository.interface";
import type { WalletIncidentStateRepository } from "./application/interfaces/wallet-incident-state-repository.interface";
import type { PlanRepository } from "../plans/application/interfaces/plan-repository.interface";
import type { IEmailService } from "../../shared/config/external/email/email.interface";
import type { IEmailOutboxRepository } from "../../shared/config/external/email/outbox-repository.types";
import type { Logger } from "../../shared/logging/logger.interface";
import type { IDiscordEventsPublisher } from "../../shared/config/external/notifications/discordevents-publisher";

import { TenantWalletController } from "./presentation/tenant-wallet.controller";
import { AdminWalletController } from "./presentation/admin-wallet.controller";

import { CheckBalanceForBatchUseCase } from "./application/use-cases/check-balance-for-batch.use-case";
import { CheckLowBalanceUseCase } from "./application/use-cases/check-low-balance.use-case";
import { CreditEnforcementOrchestrator } from "./application/use-cases/credit-enforcement-orchestrator";
import { CreditEnforcementReconciler } from "./application/services/credit-enforcement-reconciler";
import { GetWalletUseCase } from "./application/use-cases/get-wallet.use-case";
import { ListTransactionsUseCase } from "./application/use-cases/list-transactions.use-case";
import { GetWalletSummaryUseCase } from "./application/use-cases/get-wallet-summary.use-case";
import { GetTransactionDetailUseCase } from "./application/use-cases/get-transaction-detail.use-case";
import { AdjustWalletUseCase } from "./application/use-cases/adjust-wallet.use-case";
import { DebitWalletForCallUseCase } from "./application/use-cases/debit-wallet.use-case";
import { ExpireBonusCreditsUseCase } from "./application/use-cases/expire-bonus-credits.use-case";
import { BonusExpiryScheduler } from "./infrastructure/jobs/bonus-expiry.scheduler";

import {
  CallWalletGuard,
  type ICallWalletGuard,
} from "./application/guards/call-wallet.guard";

export interface WalletModuleDeps {
  planRepository: PlanRepository;
  email: IEmailService;
  emailOutboxRepository: IEmailOutboxRepository;
  logger: Logger;
  eventPublisher: IDiscordEventsPublisher;
}

export interface WalletModule {
  repository: WalletRepository;
  incidentRepository: WalletIncidentStateRepository;
  tenantController: TenantWalletController;
  adminController: AdminWalletController;
  guards: {
    callWalletGuard: ICallWalletGuard;
  };
  useCases: {
    debitWalletForCall: DebitWalletForCallUseCase;
    checkBalanceForBatch: CheckBalanceForBatchUseCase;
    checkLowBalance: CheckLowBalanceUseCase;
    creditEnforcement: CreditEnforcementOrchestrator;
    adjustWallet: AdjustWalletUseCase;
    getWallet: GetWalletUseCase;
    expireBonusCredits: ExpireBonusCreditsUseCase;
  };
  schedulers: {
    bonusExpiry: BonusExpiryScheduler;
    creditEnforcementReconciler: CreditEnforcementReconciler;
  };
}

export function buildWalletModule(deps: WalletModuleDeps): WalletModule {
  const repository = new PrismaWalletRepository();
  const incidentRepository = new PrismaWalletIncidentStateRepository();
  const log = deps.logger.child({ module: "wallet" });

  const getWallet = new GetWalletUseCase(repository);
  const listTransactions = new ListTransactionsUseCase(repository);
  const getWalletSummary = new GetWalletSummaryUseCase(repository);
  const getTransactionDetail = new GetTransactionDetailUseCase(repository);
  const adjustWallet = new AdjustWalletUseCase(repository, log);

  const checkLowBalance = new CheckLowBalanceUseCase(
    repository,
    deps.planRepository,
    deps.email,
    log,
    deps.eventPublisher,
  );

  const creditEnforcement = new CreditEnforcementOrchestrator({
    incidents: incidentRepository,
    wallets: repository,
    // U-05 replaces this with real Bolna/Sarvam adapters.
    providers: new NoopCampaignStopAdapter(),
    emailOutbox: deps.emailOutboxRepository,
    tenantEmail: async (tenantId: string) => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { email: true },
      });
      return tenant?.email ?? null;
    },
    logger: log,
  });

  const creditEnforcementReconciler = new CreditEnforcementReconciler({
    incidents: incidentRepository,
    orchestrator: creditEnforcement,
    logger: log,
    enabled: true,
    pollMs: 30_000,
    batchSize: 25,
    leaseMs: 60_000,
  });

  const checkBalanceForBatch = new CheckBalanceForBatchUseCase(
    repository,
    deps.planRepository,
    log,
  );
  const debitWalletForCall = new DebitWalletForCallUseCase(
    repository,
    deps.planRepository,
    checkLowBalance,
    creditEnforcement,
    log,
  );

  const expireBonusCredits = new ExpireBonusCreditsUseCase(
    repository,
    deps.planRepository,
    deps.email,
    log,
  );

  const bonusExpiryScheduler = new BonusExpiryScheduler(
    expireBonusCredits,
    log,
  );

  const callWalletGuard = new CallWalletGuard(repository);

  return {
    repository,
    incidentRepository,
    tenantController: new TenantWalletController(
      getWallet,
      listTransactions,
      getWalletSummary,
      getTransactionDetail,
    ),
    adminController: new AdminWalletController(
      getWallet,
      listTransactions,
      adjustWallet,
    ),
    guards: {
      callWalletGuard,
    },
    useCases: {
      debitWalletForCall,
      checkBalanceForBatch,
      checkLowBalance,
      creditEnforcement,
      adjustWallet,
      getWallet,
      expireBonusCredits,
    },
    schedulers: {
      bonusExpiry: bonusExpiryScheduler,
      creditEnforcementReconciler,
    },
  };
}
