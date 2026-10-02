import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import type { UpdateWorkspaceBody } from "./tenant.schema";
import { sendSuccess } from "../../../shared/utils/response";
import type { GetTenantUseCase } from "../application/use-cases/get-tenant.use-case";
import type { UpdateTenantUseCase } from "../application/use-cases/update-tenant.use-case";
import type { GetTenantStatsUseCase } from "../application/use-cases/get-tenant-stats.use-case";

export class TenantWorkspaceController {
  constructor(
    private readonly getTenantUseCase: GetTenantUseCase,
    private readonly updateTenantUseCase: UpdateTenantUseCase,
    private readonly getTenantStatsUseCase: GetTenantStatsUseCase,
  ) {}

  getCurrent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const tenant = await this.getTenantUseCase.execute(tenantId);
      sendSuccess(res, tenant);
    } catch (err) {
      next(err);
    }
  };

  updateCurrent = async (
    req: Request<unknown, unknown, UpdateWorkspaceBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const updated = await this.updateTenantUseCase.execute(tenantId, {
        name: req.body.name,
      });
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  };

  getCurrentStats = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const stats = await this.getTenantStatsUseCase.execute(tenantId);
      sendSuccess(res, stats);
    } catch (err) {
      next(err);
    }
  };
}
