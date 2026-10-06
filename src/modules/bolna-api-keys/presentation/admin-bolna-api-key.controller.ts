import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import type { AuthRequest } from "../../../shared/types";
import type { CreateBolnaApiKeyUseCase } from "../application/use-cases/create-bolna-api-key.use-case";
import type { ListBolnaApiKeysUseCase } from "../application/use-cases/list-bolna-api-keys.use-case";
import type { DeactivateBolnaApiKeyUseCase } from "../application/use-cases/deactivate-bolna-api-key.use-case";
import type { SwitchTenantWorkspaceUseCase } from "../application/use-cases/switch-tenant-workspace.use-case";
import type { GetSwitchReadinessUseCase } from "../application/use-cases/get-switch-readiness.use-case";
import type { GetWorkspaceSwitchStatusUseCase } from "../application/use-cases/get-workspace-switch-status.use-case";

export class AdminBolnaApiKeyController {
  constructor(
    private readonly createKeyUseCase: CreateBolnaApiKeyUseCase,
    private readonly listKeysUseCase: ListBolnaApiKeysUseCase,
    private readonly deactivateKeyUseCase: DeactivateBolnaApiKeyUseCase,
    private readonly switchWorkspaceUseCase: SwitchTenantWorkspaceUseCase,
    private readonly getReadinessUseCase: GetSwitchReadinessUseCase,
    private readonly getStatusUseCase: GetWorkspaceSwitchStatusUseCase,
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

  /**
   * POST /v1/admin/bolna-keys/:id/assign
   * Triggers the safe workspace migration & background agent cloning.
   */
  assign = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const keyId = param(req, "id");
      const { tenantId } = req.body;

      const result = await this.switchWorkspaceUseCase.execute(tenantId, keyId);
      sendSuccess(res, result, HttpStatus.ACCEPTED);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /v1/admin/bolna-keys/switch-readiness?tenantId=...&targetKeyId=...
   */
  getReadiness = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId, targetKeyId } = req.query as {
        tenantId: string;
        targetKeyId: string;
      };

      const result = await this.getReadinessUseCase.execute(
        tenantId,
        targetKeyId,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /v1/admin/bolna-keys/tenants/:tenantId/switch-status
   */
  getStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = param(req, "tenantId");
      const result = await this.getStatusUseCase.execute(tenantId);
      sendSuccess(res, result);
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
