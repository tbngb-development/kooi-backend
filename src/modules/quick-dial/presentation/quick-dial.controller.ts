import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import { UnauthorizedError } from "../../../shared/errors";
import type { InitiateQuickDialUseCase } from "../application/use-cases/initiate-quick-dial.use-case";
import type { InitiateBatchQuickDialUseCase } from "../application/use-cases/initiate-batch-quick-dial.use-case";
import type { GetQuickDialJobUseCase } from "../application/use-cases/get-quick-dial-job.use-case";
import type { ListQuickDialJobsUseCase } from "../application/use-cases/list-quick-dial-jobs.use-case";
import type { QuickDialStatus } from "@prisma/client";

export class QuickDialController {
  constructor(
    private readonly initiateQuickDialUseCase: InitiateQuickDialUseCase,
    private readonly initiateBatchQuickDialUseCase: InitiateBatchQuickDialUseCase,
    private readonly getQuickDialJobUseCase: GetQuickDialJobUseCase,
    private readonly listQuickDialJobsUseCase: ListQuickDialJobsUseCase,
  ) {}

  private resolveTenantId(req: Request): string {
    const tenantId = ((req as AuthRequest).user as TenantAuthContext)?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedError("Tenant context is required.");
    }
    return tenantId;
  }

  private resolveUserId(req: Request): string {
    const userId = ((req as AuthRequest).user as TenantAuthContext)?.userId;
    if (!userId) {
      throw new UnauthorizedError("User context is required.");
    }
    return userId;
  }

  initiate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const userId = this.resolveUserId(req);
      const result = await this.initiateQuickDialUseCase.execute({
        tenantId,
        userId,
        assistantId: req.body.assistantId,
        recipientPhone: req.body.recipientPhone,
        leadId: req.body.leadId,
        fromPhoneNumber: req.body.fromPhoneNumber,
        userData: req.body.userData,
        metadata: req.body.metadata,
      });

      sendSuccess(
        res,
        result,
        HttpStatus.CREATED,
        "Quick dial call initiated successfully",
      );
    } catch (err) {
      next(err);
    }
  };

  initiateBatch = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const userId = this.resolveUserId(req);
      const result = await this.initiateBatchQuickDialUseCase.execute({
        tenantId,
        userId,
        assistantId: req.body.assistantId,
        fromPhoneNumber: req.body.fromPhoneNumber,
        contacts: req.body.contacts,
      });

      sendSuccess(
        res,
        result,
        HttpStatus.CREATED,
        `Batch quick dial finished: ${result.initiatedCount} initiated, ${result.failedCount} failed`,
      );
    } catch (err) {
      next(err);
    }
  };


  get = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const id = param(req, "id");
      const result = await this.getQuickDialJobUseCase.execute(tenantId, id);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const result = await this.listQuickDialJobsUseCase.execute({
        tenantId,
        assistantId: req.query.assistantId as string | undefined,
        status: req.query.status as QuickDialStatus | undefined,
        search: req.query.search as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
