import type { Request, Response, NextFunction } from "express";
import type { CreateTenantApiKeyUseCase } from "../application/use-cases/create-tenant-api-key.use-case";
import type { ListTenantApiKeysUseCase } from "../application/use-cases/list-tenant-api-keys.use-case";
import type { DeleteTenantApiKeyUseCase } from "../application/use-cases/delete-tenant-api-key.use-case";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { ApiKeyMessages } from "../../../shared/constants/messages";
import type { TenantAuthContext } from "../../../shared/types";

export class TenantApiKeyController {
  constructor(
    private readonly createUseCase: CreateTenantApiKeyUseCase,
    private readonly listUseCase: ListTenantApiKeysUseCase,
    private readonly deleteUseCase: DeleteTenantApiKeyUseCase,
  ) {}

  create = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = (req as Request & { user: TenantAuthContext }).user;
      const result = await this.createUseCase.execute(
        user.tenantId,
        user.userId,
      );

      sendSuccess(res, result, HttpStatus.CREATED, ApiKeyMessages.CREATED);
    } catch (err) {
      next(err);
    }
  };

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = (req as Request & { user: TenantAuthContext }).user;
      const { page, limit } = req.query as unknown as {
        page?: number;
        limit?: number;
      };

      const result = await this.listUseCase.execute(
        user.tenantId,
        page ? Number(page) : 1,
        limit ? Number(limit) : 20,
      );

      sendSuccess(res, result, HttpStatus.OK);
    } catch (err) {
      next(err);
    }
  };

  delete = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = (req as Request & { user: TenantAuthContext }).user;
      const { id } = req.params;

      await this.deleteUseCase.execute(id as string, user.tenantId, user.userId);

      sendSuccess(res, null, HttpStatus.OK, ApiKeyMessages.DELETED);
    } catch (err) {
      next(err);
    }
  };
}
