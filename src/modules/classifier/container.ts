import { PrismaClassifierRepository } from "./infrastructure/repositories/prisma-classifier.repository";
import { ClassifierProviderImpl } from "./infrastructure/services/classifier.provider";
import { ProcessClassifierExtractionUseCase } from "./application/use-cases/process-classifier-extraction.use-case";
import { CreateClassifierDispositionUseCase } from "./application/use-cases/create-classifier-disposition.use-case";
import { UpdateClassifierDispositionUseCase } from "./application/use-cases/update-classifier-disposition.use-case";
import { DeleteClassifierDispositionUseCase } from "./application/use-cases/delete-classifier-disposition.use-case";
import { ListClassifierDispositionsUseCase } from "./application/use-cases/list-classifier-dispositions.use-case";
import { GetClassifierDispositionUseCase } from "./application/use-cases/get-classifier-disposition.use-case";
import { AssignClassifierToAgentUseCase } from "./application/use-cases/assign-classifier-to-agent.use-case";
import { RemoveClassifierFromAgentUseCase } from "./application/use-cases/remove-classifier-from-agent.use-case";
import { ListAgentClassifiersUseCase } from "./application/use-cases/list-agent-classifiers.use-case";
import { TestClassifierUseCase } from "./application/use-cases/test-classifier.use-case";
import { GetClassifierCallResultUseCase } from "./application/use-cases/get-classifier-call-result.use-case";
import { ListClassifierCallResultsUseCase } from "./application/use-cases/list-classifier-call-results.use-case";
import { ClassifierExtractionWorker } from "./infrastructure/jobs/classifier-extraction.worker";
import { ClassifierExtractionScheduler } from "./infrastructure/jobs/classifier-extraction.scheduler";
import { AdminClassifierController } from "./presentation/admin-classifier.controller";
import { TenantClassifierController } from "./presentation/tenant-classifier.controller";
import type { Logger } from "../../shared/logging/logger.interface";
import type { Queue } from "bull";

export interface ClassifierModuleDeps {
  logger: Logger;
}

export interface ClassifierModule {
  adminController: AdminClassifierController;
  tenantController: TenantClassifierController;
  repository: PrismaClassifierRepository;
  queue: Queue;
  schedulers: {
    classifierExtraction: ClassifierExtractionScheduler;
  };
}

export function buildClassifierModule(
  deps: ClassifierModuleDeps,
): ClassifierModule {
  const log = deps.logger.child({ module: "classifier" });

  const repository = new PrismaClassifierRepository();
  const provider = new ClassifierProviderImpl();

  // Use cases
  const processExtraction = new ProcessClassifierExtractionUseCase(
    repository,
    provider,
    log,
  );
  const createDisposition = new CreateClassifierDispositionUseCase(repository);
  const updateDisposition = new UpdateClassifierDispositionUseCase(repository);
  const deleteDisposition = new DeleteClassifierDispositionUseCase(repository);
  const listDispositions = new ListClassifierDispositionsUseCase(repository);
  const getDisposition = new GetClassifierDispositionUseCase(repository);
  const assignToAgent = new AssignClassifierToAgentUseCase(repository);
  const removeFromAgent = new RemoveClassifierFromAgentUseCase(repository);
  const listAgentClassifiers = new ListAgentClassifiersUseCase(repository);
  const testClassifier = new TestClassifierUseCase(repository, provider);
  const getCallResult = new GetClassifierCallResultUseCase(repository);
  const listCallResults = new ListClassifierCallResultsUseCase(repository);

  // Worker + Scheduler
  const worker = new ClassifierExtractionWorker(processExtraction, log);
  const scheduler = new ClassifierExtractionScheduler(worker, log);

  // Controllers
  const adminController = new AdminClassifierController(
    createDisposition,
    updateDisposition,
    deleteDisposition,
    listDispositions,
    getDisposition,
    assignToAgent,
    removeFromAgent,
    listAgentClassifiers,
    testClassifier,
    getCallResult,
    listCallResults,
    log,
  );

  const tenantController = new TenantClassifierController(
    getCallResult,
    listCallResults,
  );

  return {
    adminController,
    tenantController,
    repository,
    queue: scheduler.getQueue(),
    schedulers: {
      classifierExtraction: scheduler,
    },
  };
}
