import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { parseDateRange } from "../domain/rules/date-range.rules";
import { csvFilename } from "../domain/rules/csv-serializer";
import {
  dashboardFiltersSchema,
  timeSeriesFiltersSchema,
  topCampaignsQuerySchema,
} from "./dashboard.schema";

import type { GetDashboardOverviewUseCase } from "../application/use-cases/get-dashboard-overview.use-case";
import type { GetCallTrendsUseCase } from "../application/use-cases/get-call-trends.use-case";
import type { GetSpendTrendsUseCase } from "../application/use-cases/get-spend-trends.use-case";
import type { GetLeadFunnelUseCase } from "../application/use-cases/get-lead-funnel.use-case";
import type { GetDispositionBreakdownUseCase } from "../application/use-cases/get-disposition-breakdown.use-case";
import type { GetTemperatureDistributionUseCase } from "../application/use-cases/get-temperature-distribution.use-case";
import type { GetCampaignPerformanceUseCase } from "../application/use-cases/get-campaign-performance.use-case";
import type { GetTopCampaignsUseCase } from "../application/use-cases/get-top-campaigns.use-case";
import type { GetRecentActivityUseCase } from "../application/use-cases/get-recent-activity.use-case";
import type { ExportCampaignPerformanceUseCase } from "../application/use-cases/export-campaign-performance.use-case";
import type { ExportCallTrendsUseCase } from "../application/use-cases/export-call-trends.use-case";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";

export class TenantDashboardController {
  constructor(
    private readonly getOverview: GetDashboardOverviewUseCase,
    private readonly getCallTrends: GetCallTrendsUseCase,
    private readonly getSpendTrends: GetSpendTrendsUseCase,
    private readonly getLeadFunnel: GetLeadFunnelUseCase,
    private readonly getDispositionBreakdown: GetDispositionBreakdownUseCase,
    private readonly getTemperatureDistribution: GetTemperatureDistributionUseCase,
    private readonly getCampaignPerformance: GetCampaignPerformanceUseCase,
    private readonly getTopCampaigns: GetTopCampaignsUseCase,
    private readonly getRecentActivity: GetRecentActivityUseCase,
    private readonly exportCampaignPerformance: ExportCampaignPerformanceUseCase,
    private readonly exportCallTrends: ExportCallTrendsUseCase,
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

  private sendCsv(res: Response, csv: string, filename: string): void {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
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

  dispositionBreakdown = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = this.parseFilters(req);
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      sendSuccess(
        res,
        await this.getDispositionBreakdown.execute(tenantId, filters),
      );
    } catch (err) {
      next(err);
    }
  };

  temperatureDistribution = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = this.parseFilters(req);
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      sendSuccess(
        res,
        await this.getTemperatureDistribution.execute(tenantId, filters),
      );
    } catch (err) {
      next(err);
    }
  };

  campaignPerformance = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = this.parseFilters(req);
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      sendSuccess(
        res,
        await this.getCampaignPerformance.execute(tenantId, filters),
      );
    } catch (err) {
      next(err);
    }
  };

  topCampaigns = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = topCampaignsQuerySchema.parse(req.query);
      const range = parseDateRange(query.dateFrom, query.dateTo);
      const filters = {
        dateFrom: range.from,
        dateTo: range.to,
        campaignId: query.campaignId,
      };
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      sendSuccess(
        res,
        await this.getTopCampaigns.execute(
          tenantId,
          filters,
          query.metric,
          query.limit,
        ),
      );
    } catch (err) {
      next(err);
    }
  };

  recentActivity = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      sendSuccess(res, await this.getRecentActivity.execute(tenantId));
    } catch (err) {
      next(err);
    }
  };

  exportCampaignCsv = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = this.parseFilters(req);
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const csv = await this.exportCampaignPerformance.execute(
        tenantId,
        filters,
      );
      this.sendCsv(res, csv, csvFilename("campaign_performance"));
    } catch (err) {
      next(err);
    }
  };

  exportCallTrendsCsv = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = this.parseTimeSeriesFilters(req);
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const csv = await this.exportCallTrends.execute(tenantId, filters);
      this.sendCsv(res, csv, csvFilename("call_trends"));
    } catch (err) {
      next(err);
    }
  };
}
