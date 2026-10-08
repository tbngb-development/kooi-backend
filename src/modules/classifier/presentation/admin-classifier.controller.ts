import type { Request, Response, NextFunction } from "express"; // Added NextFunction import
import type { CreateClassifierDispositionUseCase } from "../application/use-cases/create-classifier-disposition.use-case";
import type { UpdateClassifierDispositionUseCase } from "../application/use-cases/update-classifier-disposition.use-case";
import type { DeleteClassifierDispositionUseCase } from "../application/use-cases/delete-classifier-disposition.use-case";
import type { ListClassifierDispositionsUseCase } from "../application/use-cases/list-classifier-dispositions.use-case";
import type { GetClassifierDispositionUseCase } from "../application/use-cases/get-classifier-disposition.use-case";
import type { AssignClassifierToAgentUseCase } from "../application/use-cases/assign-classifier-to-agent.use-case";
import type { RemoveClassifierFromAgentUseCase } from "../application/use-cases/remove-classifier-from-agent.use-case";
import type { ListAgentClassifiersUseCase } from "../application/use-cases/list-agent-classifiers.use-case";
import type { TestClassifierUseCase } from "../application/use-cases/test-classifier.use-case";
import type { GetClassifierCallResultUseCase } from "../application/use-cases/get-classifier-call-result.use-case";
import type { ListClassifierCallResultsUseCase } from "../application/use-cases/list-classifier-call-results.use-case";
import type { Logger } from "../../../shared/logging/logger.interface";
import { sendSuccess } from "../../../shared/utils/response";
import { param } from "../../../shared/utils/paramHelper";
import { HttpStatus } from "../../../shared/constants";
import {
  listClassifierDispositionsQuerySchema,
  listClassifierResultsQuerySchema,
} from "./classifier.schema";
import { getTenantContext } from "../../../shared/utils/tenant-context";

export class AdminClassifierController {
  constructor(
    private readonly createDisposition: CreateClassifierDispositionUseCase,
    private readonly updateDisposition: UpdateClassifierDispositionUseCase,
    private readonly deleteDisposition: DeleteClassifierDispositionUseCase,
    private readonly listDispositions: ListClassifierDispositionsUseCase,
    private readonly getDisposition: GetClassifierDispositionUseCase,
    private readonly assignToAgent: AssignClassifierToAgentUseCase,
    private readonly removeFromAgent: RemoveClassifierFromAgentUseCase,
    private readonly listAgentClassifiers: ListAgentClassifiersUseCase,
    private readonly testClassifier: TestClassifierUseCase,
    private readonly getCallResult: GetClassifierCallResultUseCase,
    private readonly listCallResults: ListClassifierCallResultsUseCase,
    private readonly logger?: Logger,
  ) {}

  createDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.createDisposition.execute(req.body);
      sendSuccess(res, result, 201, "Classifier disposition created");
    } catch (err) {
      next(err);
    }
  };

  updateDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dispositionId = param(req, "id");
      const result = await this.updateDisposition.execute(
        dispositionId,
        req.body,
      );
      sendSuccess(res, result, HttpStatus.OK, "Classifier disposition updated");
    } catch (err) {
      next(err);
    }
  };

  deleteDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dispositionId = param(req, "id");
      await this.deleteDisposition.execute(dispositionId);
      sendSuccess(
        res,
        null,
        HttpStatus.NO_CONTENT,
        "Classifier disposition deleted",
      );
    } catch (err) {
      next(err);
    }
  };

  listDispositionsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      this.logger?.debug("list disposition api hit")
      const query = listClassifierDispositionsQuerySchema.parse(req.query);
      const result = await this.listDispositions.execute(query);
      this.logger?.debug("list disposition result: ", result)
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  getDispositionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dispositionId = param(req, "id");
      const result = await this.getDisposition.execute(dispositionId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  assignToAgentHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const agentId = param(req, "agentId");
      await this.assignToAgent.execute(
        agentId,
        req.body.classifierDispositionIds,
      );
      sendSuccess(
        res,
        null,
        HttpStatus.OK,
        "Classifier dispositions assigned to agent",
      );
    } catch (err) {
      next(err);
    }
  };

  removeFromAgentHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const agentId = param(req, "agentId");
      await this.removeFromAgent.execute(
        agentId,
        req.body.classifierDispositionIds,
      );
      sendSuccess(
        res,
        null,
        HttpStatus.OK,
        "Classifier dispositions removed from agent",
      );
    } catch (err) {
      next(err);
    }
  };

  listAgentClassifiersHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const agentId = param(req, "agentId");
      const result = await this.listAgentClassifiers.execute(agentId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  testClassifierHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.testClassifier.execute(req.body);
      sendSuccess(res, result, HttpStatus.OK, "Classifier test completed");
    } catch (err) {
      next(err);
    }
  };

  getCallResultHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const callId = param(req, "callId");
      const result = await this.getCallResult.execute(callId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  listCallResultsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = getTenantContext(req);
      const resolvedTenantId = Array.isArray(tenantId) ? tenantId[0] : tenantId;
      const query = listClassifierResultsQuerySchema.parse(req.query);
      const result = await this.listCallResults.execute({
        tenantId: resolvedTenantId,
        ...query,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
