import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { AdminMessages } from "../../../shared/constants/messages";
import { param } from "../../../shared/utils/paramHelper";
import type { ListBatchesUseCase } from "../application/use-cases/list-batches.use-case";
import type { GetBatchUseCase } from "../application/use-cases/get-batch.use-case";
import type { GetBatchStatsUseCase } from "../application/use-cases/get-batch-stats.use-case";
import { TenantBadRequestError } from "../../tenants/domain/tenant.errors";

export class AdminBatchController {
  constructor(
    private readonly listBatchesUseCase: ListBatchesUseCase,
    private readonly getBatchUseCase: GetBatchUseCase,
    private readonly getBatchStatsUseCase: GetBatchStatsUseCase,
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

  private requireCampaignId(req: Request): string {
    const campaignId = req.query.campaignId as string;
    if (!campaignId) {
      throw new Error("campaignId is required");
    }
    return campaignId;
  }

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.resolveTenantId(req);
      const campaignId = this.requireCampaignId(req);
      sendSuccess(
        res,
        await this.listBatchesUseCase.execute(tenantId, campaignId),
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
      const campaignId = this.requireCampaignId(req);
      sendSuccess(
        res,
        await this.getBatchUseCase.execute(
          tenantId,
          campaignId,
          param(req, "id"),
        ),
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
      const campaignId = this.requireCampaignId(req);
      sendSuccess(
        res,
        await this.getBatchStatsUseCase.execute(
          tenantId,
          campaignId,
          param(req, "id"),
        ),
      );
    } catch (err) {
      next(err);
    }
  };
}
