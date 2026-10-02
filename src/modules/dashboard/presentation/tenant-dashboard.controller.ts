import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { parseDateRange } from "../domain/rules/date-range.rules";
import {
  dashboardFiltersSchema,
  timeSeriesFiltersSchema,
} from "./dashboard.schema";

import type { GetDashboardOverviewUseCase } from "../application/use-cases/get-dashboard-overview.use-case";
import type { GetCallTrendsUseCase } from "../application/use-cases/get-call-trends.use-case";
import type { GetSpendTrendsUseCase } from "../application/use-cases/get-spend-trends.use-case";
import type { GetLeadFunnelUseCase } from "../application/use-cases/get-lead-funnel.use-case";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";

export class TenantDashboardController {
  constructor(
    private readonly getOverview: GetDashboardOverviewUseCase,
    private readonly getCallTrends: GetCallTrendsUseCase,
    private readonly getSpendTrends: GetSpendTrendsUseCase,
    private readonly getLeadFunnel: GetLeadFunnelUseCase,
  ) {}

  private parseFilters(req: Request) {
    const query = dashboardFiltersSchema.parse(req.query);
    const range = parseDateRange(query.dateFrom, query.dateTo);
    return {
      dateFrom: range.from,
      dateTo: range.to,
      campaignId: query.campaignId,
    };
  }

  private parseTimeSeriesFilters(req: Request) {
    const query = timeSeriesFiltersSchema.parse(req.query);
    const range = parseDateRange(query.dateFrom, query.dateTo);
    return {
      dateFrom: range.from,
      dateTo: range.to,
      campaignId: query.campaignId,
      granularity: query.granularity,
    };
  }

  // ── Endpoints ───────────────────────────────────────────────────────────

  overview = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = this.parseFilters(req);
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      sendSuccess(res, await this.getOverview.execute(tenantId, filters));
    } catch (err) {
      next(err);
    }
  };

  callTrends = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = this.parseTimeSeriesFilters(req);
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      sendSuccess(res, await this.getCallTrends.execute(tenantId, filters));
    } catch (err) {
      next(err);
    }
  };

  spendTrends = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = this.parseTimeSeriesFilters(req);
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      sendSuccess(res, await this.getSpendTrends.execute(tenantId, filters));
    } catch (err) {
      next(err);
    }
  };

  leadFunnel = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = this.parseFilters(req);
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      sendSuccess(res, await this.getLeadFunnel.execute(tenantId, filters));
    } catch (err) {
      next(err);
    }
  };
}
