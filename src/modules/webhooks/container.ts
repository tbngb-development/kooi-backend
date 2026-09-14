import { PrismaWebhookRepository } from "./infrastructure/repositories/prisma-webhook.repository";
import { ProcessCallWebhookUseCase } from "./application/use-cases/process-call-webhook.use-case";
import { ProcessBatchWebhookUseCase } from "./application/use-cases/process-batch-webhook.use-case";
import { WebhookController } from "./presentation/webhook.controller";
import type { DebitWalletForCallUseCase } from "../wallet/application/use-cases/debit-wallet.use-case";
import { GenerateDynamicExtractionsUseCase } from "../calls/application/use-cases/generate-dynamic-extractions.use-case";

export interface WebhookModuleDeps {
  debitWalletForCall?: DebitWalletForCallUseCase;
}

export interface WebhookModule {
  controller: WebhookController;
}

export function buildWebhookModule(
  deps: WebhookModuleDeps = {},
): WebhookModule {
  const webhookRepo = new PrismaWebhookRepository();
  const generateDynamicExtractions = new GenerateDynamicExtractionsUseCase();

  const processCallWebhook = new ProcessCallWebhookUseCase(
    webhookRepo,
    generateDynamicExtractions,
    deps.debitWalletForCall,
  );

  const processBatchWebhook = new ProcessBatchWebhookUseCase(webhookRepo);

  const controller = new WebhookController(
    processCallWebhook,
    processBatchWebhook,
  );

  return {
    controller,
  };
}
