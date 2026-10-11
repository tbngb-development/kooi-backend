import type { Router } from "express";
import { PrismaQuickDialRepository } from "./infrastructure/repositories/prisma-quick-dial.repository";
import { InitiateQuickDialUseCase } from "./application/use-cases/initiate-quick-dial.use-case";
import { InitiateBatchQuickDialUseCase } from "./application/use-cases/initiate-batch-quick-dial.use-case";
import { GetQuickDialJobUseCase } from "./application/use-cases/get-quick-dial-job.use-case";
import { ListQuickDialJobsUseCase } from "./application/use-cases/list-quick-dial-jobs.use-case";
import { QuickDialController } from "./presentation/quick-dial.controller";
import { buildQuickDialRoutes } from "./presentation/quick-dial.routes";
import type { BolnaCallProvider } from "../calls/application/interfaces/bolna-call-provider.interface";
import type { AuthenticateMiddleware } from "../../shared/middleware/authenticate";
import type { Logger } from "../../shared/logging/logger.interface";

export interface QuickDialModuleDeps {
  bolnaCallProvider: BolnaCallProvider;
  authenticate: AuthenticateMiddleware;
  logger?: Logger;
}

export interface QuickDialModule {
  router: Router;
  controller: QuickDialController;
  repository: PrismaQuickDialRepository;
}

export function createQuickDialModule(deps: QuickDialModuleDeps): QuickDialModule {
  const repository = new PrismaQuickDialRepository();

  const initiateQuickDial = new InitiateQuickDialUseCase(
    repository,
    deps.bolnaCallProvider,
    deps.logger,
  );
  const initiateBatchQuickDial = new InitiateBatchQuickDialUseCase(
    repository,
    deps.bolnaCallProvider,
    deps.logger,
  );
  const getQuickDialJob = new GetQuickDialJobUseCase(repository);
  const listQuickDialJobs = new ListQuickDialJobsUseCase(repository);

  const controller = new QuickDialController(
    initiateQuickDial,
    initiateBatchQuickDial,
    getQuickDialJob,
    listQuickDialJobs,
  );


  const router = buildQuickDialRoutes(controller, deps.authenticate);

  return {
    router,
    controller,
    repository,
  };
}
