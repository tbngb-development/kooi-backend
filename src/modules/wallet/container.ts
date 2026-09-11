import { PrismaWalletRepository } from "./infrastructure/repositories/prisma-wallet.repository";
import type { WalletRepository } from "./application/interfaces/wallet-repository.interface";
import type { PlanRepository } from "../plans/application/interfaces/plan-repository.interface";
import type { IBolnaClientFactory } from "../../shared/config/external/bolna/bolna-client.factory";
import type { IEmailService } from "../../shared/config/external/email/email.interface";

import { TenantWalletController } from "./presentation/tenant-wallet.controller";
import { AdminWalletController } from "./presentation/admin-wallet.controller";

import { CheckBalanceForBatchUseCase } from "./application/use-cases/check-balance-for-batch.use-case";
import { CheckLowBalanceUseCase } from "./application/use-cases/check-low-balance.use-case";
import { StopBatchesOnInsufficientBalanceUseCase } from "./application/use-cases/stop-batches-on-insufficient-balance.use-case";
import { GetWalletUseCase } from "./application/use-cases/get-wallet.use-case";
import { ListTransactionsUseCase } from "./application/use-cases/list-transactions.use-case";
import { AdjustWalletUseCase } from "./application/use-cases/adjust-wallet.use-case";
import { DebitWalletForCallUseCase } from "./application/use-cases/debit-wallet.use-case";

export interface WalletModuleDeps {
  planRepository: PlanRepository;
  bolnaClientFactory: IBolnaClientFactory;
  email: IEmailService;
}

export interface WalletModule {
  repository: WalletRepository;
  tenantController: TenantWalletController;
  adminController: AdminWalletController;
  useCases: {
    debitWalletForCall: DebitWalletForCallUseCase;
    checkBalanceForBatch: CheckBalanceForBatchUseCase;
    checkLowBalance: CheckLowBalanceUseCase;
    stopBatchesOnInsufficientBalance: StopBatchesOnInsufficientBalanceUseCase;
    adjustWallet: AdjustWalletUseCase;
    getWallet: GetWalletUseCase;
  };
}

export function buildWalletModule(deps: WalletModuleDeps): WalletModule {
  const repository = new PrismaWalletRepository();

  const getWallet = new GetWalletUseCase(repository);
  const listTransactions = new ListTransactionsUseCase(repository);
  const adjustWallet = new AdjustWalletUseCase(repository);

  const checkLowBalance = new CheckLowBalanceUseCase(
    repository,
    deps.planRepository,
    deps.email,
  );
  const stopBatches = new StopBatchesOnInsufficientBalanceUseCase(
    repository,
    deps.planRepository,
    deps.bolnaClientFactory,
  );
  const checkBalanceForBatch = new CheckBalanceForBatchUseCase(
    repository,
    deps.planRepository,
  );
  const debitWalletForCall = new DebitWalletForCallUseCase(
    repository,
    deps.planRepository,
    checkLowBalance,
    stopBatches,
  );

  return {
    repository,
    tenantController: new TenantWalletController(getWallet, listTransactions),
    adminController: new AdminWalletController(
      getWallet,
      listTransactions,
      adjustWallet,
    ),
    useCases: {
      debitWalletForCall,
      checkBalanceForBatch,
      checkLowBalance,
      stopBatchesOnInsufficientBalance: stopBatches,
      adjustWallet,
      getWallet,
    },
  };
}
