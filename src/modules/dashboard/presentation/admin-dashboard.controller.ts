import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { parseDateRange } from "../domain/rules/date-range.rules";
import {
  adminFiltersSchema,
  adminTimeSeriesFiltersSchema,
  topTenantsQuerySchema,
} from "./dashboard.schema";

import type { GetAdminOverviewUseCase } from "../application/use-cases/get-admin-overview.use-case";
import type { GetRevenueTrendsUseCase } from "../application/use-cases/get-revenue-trends.use-case";
import type { GetPlatformCallTrendsUseCase } from "../application/use-cases/get-platform-call-trends.use-case";
import type { GetTenantDistributionUseCase } from "../application/use-cases/get-tenant-distribution.use-case";
import type { GetTopTenantsUseCase } from "../application/use-cases/get-top-tenants.use-case";

export class AdminDashboardController {
  constructor(
    private readonly getOverview: GetAdminOverviewUseCase,
    private readonly getRevenueTrends: GetRevenueTrendsUseCase,
    private readonly getPlatformCallTrends: GetPlatformCallTrendsUseCase,
    private readonly getTenantDistribution: GetTenantDistributionUseCase,
    private readonly getTopTenants: GetTopTenantsUseCase,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────────────

  private parseFilters(req: Request) {
    const query = adminFiltersSchema.parse(req.query);
    const range = parseDateRange(query.dateFrom, query.dateTo);
    return { dateFrom: range.from, dateTo: range.to };
  }

  private parseTimeSeriesFilters(req: Request) {
    const query = adminTimeSeriesFiltersSchema.parse(req.query);
    const range = parseDateRange(query.dateFrom, query.dateTo);
    return {
      dateFrom: range.from,
      dateTo: range.to,
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
      sendSuccess(res, await this.getOverview.execute(filters));
    } catch (err) {
      next(err);
    }
  };

  revenueTrends = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = this.parseTimeSeriesFilters(req);
      sendSuccess(res, await this.getRevenueTrends.execute(filters));
    } catch (err) {
      next(err);
    }
  };

  callVolumeTrends = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = this.parseTimeSeriesFilters(req);
      sendSuccess(res, await this.getPlatformCallTrends.execute(filters));
    } catch (err) {
      next(err);
    }
  };

  tenantDistribution = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      sendSuccess(res, await this.getTenantDistribution.execute());
    } catch (err) {
      next(err);
    }
  };

  topTenants = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = topTenantsQuerySchema.parse(req.query);
      const range = parseDateRange(query.dateFrom, query.dateTo);
      const filters = { dateFrom: range.from, dateTo: range.to };
      sendSuccess(
        res,
        await this.getTopTenants.execute(filters, query.metric, query.limit),
      );
    } catch (err) {
      next(err);
    }
  };
}
