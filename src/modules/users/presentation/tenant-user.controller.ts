import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { param } from "../../../shared/utils/paramHelper";
import type { ListUsersUseCase } from "../application/use-cases/list-users.use-case";
import type { UpdateUserUseCase } from "../application/use-cases/update-user.use-case";
import type { DeleteUserUseCase } from "../application/use-cases/delete-user.use-case";

export class TenantUserController {
  constructor(
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
  ) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const members = await this.listUsersUseCase.execute(tenantId);
      sendSuccess(res, members);
    } catch (err) {
      next(err);
    }
  };

  updateHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId, tenantRole: actorRole } = (req as AuthRequest)
        .user as TenantAuthContext;
      const targetUserId = param(req, "id");
      const updated = await this.updateUserUseCase.execute(
        tenantId,
        targetUserId,
        req.body,
        actorRole,
      );
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  };

  deleteHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const {
        tenantId,
        userId: activeUserId,
        tenantRole: actorRole,
      } = (req as AuthRequest).user as TenantAuthContext;
      const targetUserId = param(req, "id");
      await this.deleteUserUseCase.execute(
        tenantId,
        activeUserId,
        targetUserId,
        actorRole,
      );
      sendSuccess(res, { message: "User deleted successfully" });
    } catch (err) {
      next(err);
    }
  };
}
