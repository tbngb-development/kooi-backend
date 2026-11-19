import { env } from "../../shared/config/env";
import { PrismaWebhookRepository } from "./infrastructure/repositories/prisma-webhook.repository";
import { PrismaSarvamLeadCorrelationRepository } from "./infrastructure/repositories/prisma-sarvam-lead-correlation.repository";
import { SarvamLeadCorrelationService } from "./application/services/sarvam-lead-correlation.service";
import { PrismaSarvamWebhookRepository } from "./infrastructure/repositories/prisma-sarvam-webhook.repository";
import { SarvamLifecycleService } from "./application/services/sarvam-lifecycle.service";
import { ProcessSarvamWebhookUseCase } from "./application/use-cases/process-sarvam-webhook.use-case";
import { ProcessCallWebhookUseCase } from "./application/use-cases/process-call-webhook.use-case";
import { ProcessBatchWebhookUseCase } from "./application/use-cases/process-batch-webhook.use-case";
import { WebhookController } from "./presentation/webhook.controller";
import type { DebitWalletForCallUseCase } from "../wallet/application/use-cases/debit-wallet.use-case";
import type { CreditEnforcementOrchestrator } from "../wallet/application/use-cases/credit-enforcement-orchestrator";
import type { MaterializeCallExtractionsUseCase } from "../extractions/application/use-cases/materialize-call-extractions.use-case";
import { CallResolverService } from "./application/services/call-resolver.service";
import { CallLifecycleService } from "./application/services/call-lifecycle.service";
import { CallTerminalService } from "./application/services/call-terminal.service";
import { CallCompletionService } from "./application/services/call-completion.service";
import type { Logger } from "../../shared/logging/logger.interface";
import type { Queue } from "bull";

export interface WebhookModuleDeps {
  debitWalletForCall?: DebitWalletForCallUseCase;
  creditEnforcement?: CreditEnforcementOrchestrator;
  classifierQueue?: Queue;
  materializeCallExtractions?: MaterializeCallExtractionsUseCase;
  logger: Logger;
}

export interface WebhookModule {
  controller: WebhookController;
  processCallWebhook: ProcessCallWebhookUseCase;
  sarvamLeadCorrelation: SarvamLeadCorrelationService;
  processSarvamWebhook: ProcessSarvamWebhookUseCase;
}

export function buildWebhookModule(
  deps: WebhookModuleDeps = {} as WebhookModuleDeps,
): WebhookModule {
  const webhookRepo = new PrismaWebhookRepository();
  const log = deps.logger.child({ module: "webhook" });

  const callLifecycle = new CallLifecycleService(webhookRepo, log);
  const callResolver = new CallResolverService(webhookRepo, log);
  const callTerminal = new CallTerminalService(webhookRepo, callLifecycle, log);
  const callCompletion = new CallCompletionService(
    webhookRepo,
    deps.materializeCallExtractions,
    deps.debitWalletForCall,
    deps.classifierQueue,
    callLifecycle,
    log,
  );

  const processCallWebhook = new ProcessCallWebhookUseCase(
    webhookRepo,
    callResolver,
    callCompletion,
    callTerminal,
    deps.creditEnforcement,
    log,
  );

  const processBatchWebhook = new ProcessBatchWebhookUseCase(webhookRepo, log);

  const sarvamCorrelationRepo = new PrismaSarvamLeadCorrelationRepository();
  const sarvamLeadCorrelation = new SarvamLeadCorrelationService(
    sarvamCorrelationRepo,
    log,
  );
  const sarvamWebhookRepo = new PrismaSarvamWebhookRepository();
  const sarvamLifecycle = new SarvamLifecycleService(sarvamWebhookRepo, log);
  const processSarvamWebhook = new ProcessSarvamWebhookUseCase(
    sarvamLeadCorrelation,
    sarvamWebhookRepo,
    log,
    undefined,
    undefined,
    deps.debitWalletForCall,
    env.sarvam.costPerMinutePaisa,
    sarvamLifecycle,
  );

  const controller = new WebhookController(
    processCallWebhook,
    processBatchWebhook,
    processSarvamWebhook,
    log,
  );

  return {
    controller,
    processCallWebhook,
    sarvamLeadCorrelation,
    processSarvamWebhook,
  };
}
