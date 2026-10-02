import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { param } from "../../../shared/utils/paramHelper";
import type { ListAdminUsersUseCase, DeactivateUserUseCase } from "../application/use-cases/admin-users.use-cases";

export class AdminUserController {
  constructor(
    private readonly listUC: ListAdminUsersUseCase,
    private readonly deactivateUC: DeactivateUserUseCase,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 50;
      const search = req.query.search as string;
      const tenantId = req.query.tenantId as string;

      const data = await this.listUC.execute({ tenantId, search, page, limit });
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };

  toggleActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { isActive } = req.body;
      const data = await this.deactivateUC.execute(param(req, "id"), isActive);
      sendSuccess(res, data);
    } catch (err) { next(err); }
  };
}