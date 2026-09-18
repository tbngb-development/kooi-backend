import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import type { ListCallsQuery, GetCallStatsQuery } from "./call.schema";
import { sendSuccess } from "../../../shared/utils/response";
import { AdminMessages } from "../../../shared/constants/messages";
import { param } from "../../../shared/utils/paramHelper";
import type { ListCallsUseCase } from "../application/use-cases/list-calls.use-case";
import type { GetCallUseCase } from "../application/use-cases/get-call.use-case";
import type { GetCallTranscriptUseCase } from "../application/use-cases/get-call-transcript.use-case";
import type { GetCallStatsUseCase } from "../application/use-cases/get-call-stats.use-case";
import type { GetCallExtractionResponseUseCase } from "../application/use-cases/get-call-extraction-response.use-case";
import { TenantBadRequestError } from "../../tenants/domain/tenant.errors";

export class AdminCallController {
  constructor(
    private readonly listCallsUseCase: ListCallsUseCase,
    private readonly getCallDetailsUseCase: GetCallUseCase,
    private readonly getCallTranscriptUseCase: GetCallTranscriptUseCase,
    private readonly getCallStatsUseCase: GetCallStatsUseCase,
    private readonly getCallExtractionResponseUseCase: GetCallExtractionResponseUseCase,
  ) {}

  private resolveTenantId(req: Request): string {
    const tenantId =
      (req.query.tenantId as string) ??
      (req.body?.tenantId as string) ??
      ((req as AuthRequest).user as TenantAuthContext)?.tenantId;

    if (!tenantId) {
      throw new TenantBadRequestError(AdminMessages.TENANT_ID_REQUIRED);
    }
    return tenantId;
  }

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const query = req.query as unknown as ListCallsQuery;

      const data = await this.listCallsUseCase.execute({
        tenantId,
        campaignId: query.campaignId,
        leadId: query.leadId,
        status: query.status,
        disposition: query.disposition,
        leadTemperature: query.leadTemperature,
        locationMatch: query.locationMatch,
        search: query.search,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        page: query.page,
        limit: query.limit,
      });

      sendSuccess(res, data);
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
      sendSuccess(
        res,
        await this.getCallDetailsUseCase.execute(tenantId, param(req, "id")),
      );
    } catch (err) {
      next(err);
    }
  };

  getTranscript = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      sendSuccess(
        res,
        await this.getCallTranscriptUseCase.execute(tenantId, param(req, "id")),
      );
    } catch (err) {
      next(err);
    }
  };

  stats = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const query = req.query as unknown as GetCallStatsQuery;
      sendSuccess(
        res,
        await this.getCallStatsUseCase.execute({
          tenantId,
          campaignId: query.campaignId,
          leadId: query.leadId,
        }),
      );
    } catch (err) {
      next(err);
    }
  };

  getExtractionResponse = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const data = await this.getCallExtractionResponseUseCase.execute(
        tenantId,
        param(req, "id"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}
