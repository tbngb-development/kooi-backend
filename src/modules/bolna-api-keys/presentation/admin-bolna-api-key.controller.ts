import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import type { AuthRequest } from "../../../shared/types";
import type { CreateBolnaApiKeyUseCase } from "../application/use-cases/create-bolna-api-key.use-case";
import type { ListBolnaApiKeysUseCase } from "../application/use-cases/list-bolna-api-keys.use-case";
import type { AssignKeyToTenantUseCase } from "../application/use-cases/assign-key-to-tenant.use-case";
import type { DeactivateBolnaApiKeyUseCase } from "../application/use-cases/deactivate-bolna-api-key.use-case";

export class AdminBolnaApiKeyController {
  constructor(
    private readonly createKeyUseCase: CreateBolnaApiKeyUseCase,
    private readonly listKeysUseCase: ListBolnaApiKeysUseCase,
    private readonly assignKeyUseCase: AssignKeyToTenantUseCase,
    private readonly deactivateKeyUseCase: DeactivateBolnaApiKeyUseCase,
  ) {}

  list = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const keys = await this.listKeysUseCase.execute();
      sendSuccess(res, keys);
    } catch (err) {
      next(err);
    }
  };

  create = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { userId } = (req as AuthRequest).user;
      const key = await this.createKeyUseCase.execute({
        ...req.body,
        createdBy: userId,
      });
      sendSuccess(res, key, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  assign = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.assignKeyUseCase.execute({
        keyId: param(req, "id"),
        tenantId: req.body.tenantId,
      });
      sendSuccess(res, { message: "Key assigned successfully" });
    } catch (err) {
      next(err);
    }
  };

  deactivate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.deactivateKeyUseCase.execute(param(req, "id"));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
