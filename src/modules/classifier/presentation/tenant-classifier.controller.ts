import type { Request, Response, NextFunction } from "express"; // Added NextFunction import
import type { GetClassifierCallResultUseCase } from "../application/use-cases/get-classifier-call-result.use-case";
import type { ListClassifierCallResultsUseCase } from "../application/use-cases/list-classifier-call-results.use-case";
import { getTenantContext } from "../../../shared/utils/tenant-context";
import { sendSuccess } from "../../../shared/utils/response";
import { param } from "../../../shared/utils/paramHelper";

export class TenantClassifierController {
  constructor(
    private readonly getCallResult: GetClassifierCallResultUseCase,
    private readonly listCallResults: ListClassifierCallResultsUseCase,
  ) {}

  getCallResultHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = getTenantContext(req);
      const resolvedTenantId = Array.isArray(tenantId) ? tenantId[0] : tenantId;
      const callId = param(req, "callId");

      const result = await this.getCallResult.execute(callId, resolvedTenantId);
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

      const result = await this.listCallResults.execute({
        tenantId: resolvedTenantId,
        ...(req.query as any),
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
