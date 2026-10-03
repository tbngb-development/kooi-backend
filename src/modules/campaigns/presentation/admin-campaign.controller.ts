// modules/campaigns/presentation/admin-campaign.controller.ts

import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { AdminMessages } from "../../../shared/constants/messages";
import { param } from "../../../shared/utils/paramHelper";
import { TenantBadRequestError } from "../../tenants/domain/tenant.errors";
import type { ListCampaignsUseCase } from "../application/use-cases/list-campaigns.use-case";
import type { GetCampaignUseCase } from "../application/use-cases/get-campaign.use-case";
import type { GetCampaignStatsUseCase } from "../application/use-cases/get-campaign-stats.use-case";
import type { ArchiveCampaignUseCase } from "../application/use-cases/archive-campaign.use-case";
import type { RestoreCampaignUseCase } from "../application/use-cases/restore-campaign.use-case";

export class AdminCampaignController {
  constructor(
    private readonly listCampaignsUseCase: ListCampaignsUseCase,
    private readonly getCampaignUseCase: GetCampaignUseCase,
    private readonly getCampaignStatsUseCase: GetCampaignStatsUseCase,
    private readonly archiveCampaignUseCase: ArchiveCampaignUseCase,
    private readonly restoreCampaignUseCase: RestoreCampaignUseCase,
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
      const data = await this.listCampaignsUseCase.execute({
        tenantId,
        search: req.query.search as string | undefined,
        status: req.query.status as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        sortBy: req.query.sortBy as "createdAt" | "totalLeads" | undefined,
        sortOrder: req.query.sortOrder as "asc" | "desc" | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        includeDeleted: req.query.includeDeleted === "true", // Admins can optionally pull archived entries
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

  archive = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const campaignId = param(req, "id");
      await this.archiveCampaignUseCase.execute(tenantId, campaignId);
      sendSuccess(
        res,
        { id: campaignId },
        200,
        "Campaign archived by Admin successfully",
      );
    } catch (err) {
      next(err);
    }
  };

  restore = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const campaignId = param(req, "id");
      await this.restoreCampaignUseCase.execute(tenantId, campaignId);
      sendSuccess(
        res,
        { id: campaignId },
        200,
        "Campaign restored by Admin successfully",
      );
    } catch (err) {
      next(err);
    }
  };
}
