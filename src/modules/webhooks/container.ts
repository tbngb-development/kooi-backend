import { PrismaWebhookRepository } from "./infrastructure/repositories/prisma-webhook.repository";
import { ProcessCallWebhookUseCase } from "./application/use-cases/process-call-webhook.use-case";
import { ProcessBatchWebhookUseCase } from "./application/use-cases/process-batch-webhook.use-case";
import { WebhookController } from "./presentation/webhook.controller";
import type { DebitWalletForCallUseCase } from "../wallet/application/use-cases/debit-wallet.use-case";
import { StopBatchesOnInsufficientBalanceUseCase } from "../wallet/application/use-cases/stop-batches-on-insufficient-balance.use-case";
import { PrismaWalletRepository } from "../wallet/infrastructure/repositories/prisma-wallet.repository";
import { PrismaPlanRepository } from "../plans/infrastructure/repositories/prisma-plan.repository";
import { BolnaClientFactory } from "../../shared/config/external/bolna/bolna-client.factory";
import { PrismaBolnaApiKeyRepository } from "../bolna-api-keys/infrastructure/repositories/prisma-bolna-api-key.repository";
import type { Logger } from "../../shared/logging/logger.interface";
import type { Queue } from "bull";

export interface WebhookModuleDeps {
  debitWalletForCall?: DebitWalletForCallUseCase;
  classifierQueue?: Queue;
  logger: Logger;
}

export interface WebhookModule {
  controller: WebhookController;
}

export function buildWebhookModule(
  deps: WebhookModuleDeps = {} as WebhookModuleDeps,
): WebhookModule {
  const webhookRepo = new PrismaWebhookRepository();
  const walletRepo = new PrismaWalletRepository();
  const planRepo = new PrismaPlanRepository();
  const bolnaApiKeyRepo = new PrismaBolnaApiKeyRepository();
  const bolnaClientFactory = new BolnaClientFactory(bolnaApiKeyRepo);
  const log = deps.logger.child({ module: "webhook" });

  const stopBatchesOnInsufficientBalance =
    new StopBatchesOnInsufficientBalanceUseCase(
      walletRepo,
      planRepo,
      bolnaClientFactory,
      log,
    );

  const processCallWebhook = new ProcessCallWebhookUseCase(
    webhookRepo,
    deps.debitWalletForCall,
    stopBatchesOnInsufficientBalance,
    deps.classifierQueue,
    log,
  );

  const processBatchWebhook = new ProcessBatchWebhookUseCase(webhookRepo, log);

  const controller = new WebhookController(
    processCallWebhook,
    processBatchWebhook,
    log,
  );

  return {
    controller,
  };
}
