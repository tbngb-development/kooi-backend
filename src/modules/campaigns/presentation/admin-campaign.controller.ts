import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { AdminMessages } from "../../../shared/constants/messages";
import { param } from "../../../shared/utils/paramHelper";
import { TenantBadRequestError } from "../../tenants/domain/tenant.errors";
import type { ListCampaignsUseCase } from "../application/use-cases/list-campaigns.use-case";
import type { GetCampaignUseCase } from "../application/use-cases/get-campaign.use-case";
import type { GetCampaignStatsUseCase } from "../application/use-cases/get-campaign-stats.use-case";
import type { GetCampaignPerformanceUseCase } from "../application/use-cases/get-campaign-performance.use-case";
import type { GetCampaignPerformanceV2UseCase } from "../application/use-cases/get-campaign-performance-v2.use-case";

export class AdminCampaignController {
  constructor(
    private readonly listCampaignsUseCase: ListCampaignsUseCase,
    private readonly getCampaignUseCase: GetCampaignUseCase,
    private readonly getCampaignStatsUseCase: GetCampaignStatsUseCase,
    private readonly getCampaignPerformanceUseCase: GetCampaignPerformanceUseCase,
    private readonly getCampaignPerformanceV2UseCase: GetCampaignPerformanceV2UseCase,
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
      sendSuccess(res, await this.listCampaignsUseCase.execute(tenantId));
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
        await this.getCampaignUseCase.execute(tenantId, param(req, "id")),
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
      sendSuccess(
        res,
        await this.getCampaignStatsUseCase.execute(tenantId, param(req, "id")),
      );
    } catch (err) {
      next(err);
    }
  };

  performance = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      sendSuccess(
        res,
        await this.getCampaignPerformanceUseCase.execute(
          tenantId,
          param(req, "id"),
        ),
      );
    } catch (err) {
      next(err);
    }
  };

  performanceV2 = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const batchId = req.query.batchId as string | undefined;
      sendSuccess(
        res,
        await this.getCampaignPerformanceV2UseCase.execute(
          tenantId,
          param(req, "id"),
          batchId,
        ),
      );
    } catch (err) {
      next(err);
    }
  };
}
