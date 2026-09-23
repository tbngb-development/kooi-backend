import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { AdminMessages } from "../../../shared/constants/messages";
import { param } from "../../../shared/utils/paramHelper";
import { TenantBadRequestError } from "../../tenants/domain/tenant.errors";
import type { ListCampaignsUseCase } from "../application/use-cases/list-campaigns.use-case";
import type { GetCampaignUseCase } from "../application/use-cases/get-campaign.use-case";
import type { GetCampaignStatsUseCase } from "../application/use-cases/get-campaign-stats.use-case";

export class AdminCampaignController {
  constructor(
    private readonly listCampaignsUseCase: ListCampaignsUseCase,
    private readonly getCampaignUseCase: GetCampaignUseCase,
    private readonly getCampaignStatsUseCase: GetCampaignStatsUseCase,
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
}
