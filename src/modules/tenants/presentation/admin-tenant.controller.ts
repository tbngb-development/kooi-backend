import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { param } from "../../../shared/utils/paramHelper";
import type { ListTenantsUseCase } from "../application/use-cases/list-tenants.use-case";
import type { GetTenantUseCase } from "../application/use-cases/get-tenant.use-case";
import type { UpdateTenantUseCase } from "../application/use-cases/update-tenant.use-case";
import type { GetTenantStatsUseCase } from "../application/use-cases/get-tenant-stats.use-case";

export class AdminTenantController {
  constructor(
    private readonly listTenantsUseCase: ListTenantsUseCase,
    private readonly getTenantUseCase: GetTenantUseCase,
    private readonly updateTenantUseCase: UpdateTenantUseCase,
    private readonly getTenantStatsUseCase: GetTenantStatsUseCase,
  ) {}

  list = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenants = await this.listTenantsUseCase.execute();
      sendSuccess(res, tenants);
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
      const tenant = await this.getTenantUseCase.execute(param(req, "id"));
      sendSuccess(res, tenant);
    } catch (err) {
      next(err);
    }
  };

  update = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const updated = await this.updateTenantUseCase.execute(
        param(req, "id"),
        req.body,
      );
      sendSuccess(res, updated);
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
      const stats = await this.getTenantStatsUseCase.execute(param(req, "id"));
      sendSuccess(res, stats);
    } catch (err) {
      next(err);
    }
  };
}
