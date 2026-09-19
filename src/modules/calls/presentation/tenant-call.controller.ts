import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import type { ListCallsQuery, GetCallStatsQuery } from "./call.schema";
import { sendSuccess } from "../../../shared/utils/response";
import { param } from "../../../shared/utils/paramHelper";
import type { ListCallsUseCase } from "../application/use-cases/list-calls.use-case";
import type { GetCallUseCase } from "../application/use-cases/get-call.use-case";
import type { GetCallTranscriptUseCase } from "../application/use-cases/get-call-transcript.use-case";
import type { GetCallStatsUseCase } from "../application/use-cases/get-call-stats.use-case";
import type { GetCallExtractionResponseUseCase } from "../application/use-cases/get-call-extraction-response.use-case";
import type { GetAvailableFiltersUseCase } from "../application/use-cases/get-available-filters.use-case";

export class TenantCallController {
  constructor(
    private readonly listCallsUseCase: ListCallsUseCase,
    private readonly getCallDetailsUseCase: GetCallUseCase,
    private readonly getCallTranscriptUseCase: GetCallTranscriptUseCase,
    private readonly getCallStatsUseCase: GetCallStatsUseCase,
    private readonly getCallExtractionResponseUseCase: GetCallExtractionResponseUseCase,
    private readonly getAvailableFiltersUseCase: GetAvailableFiltersUseCase,
  ) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
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
        dynamicFilters: query.dynamicFilters,
        metricKey: query.metricKey,
        metricValue: query.metricValue,
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
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const data = await this.getCallDetailsUseCase.execute(
        tenantId,
        param(req, "id"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  getTranscriptHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const data = await this.getCallTranscriptUseCase.execute(
        tenantId,
        param(req, "id"),
      );
      sendSuccess(res, data);
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
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const query = req.query as unknown as GetCallStatsQuery;

      const data = await this.getCallStatsUseCase.execute({
        tenantId,
        campaignId: query.campaignId,
        leadId: query.leadId,
      });

      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  // ── [NEW] Dedicated dynamic extraction response endpoint ─────────────────
  getExtractionResponseHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const data = await this.getCallExtractionResponseUseCase.execute(
        tenantId,
        param(req, "id"),
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  getAvailableFilters = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const query = req.query as unknown as { campaignId: string };
      const data = await this.getAvailableFiltersUseCase.execute(
        tenantId,
        query.campaignId,
      );
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}
