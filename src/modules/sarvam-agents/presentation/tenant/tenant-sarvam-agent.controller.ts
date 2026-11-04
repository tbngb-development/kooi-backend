import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../../shared/utils/response";
import { HttpStatus } from "../../../../shared/constants/http-status";
import { param } from "../../../../shared/utils/paramHelper";
import type { AuthRequest, TenantAuthContext } from "../../../../shared/types";
import type { ListTenantSarvamAgentsUseCase } from "../../application/use-cases/tenant/list-tenant-sarvam-agents.use-case";
import type { GetTenantSarvamAgentUseCase } from "../../application/use-cases/tenant/get-tenant-sarvam-agent.use-case";
import type { UpdateTenantSarvamAgentVariablesUseCase } from "../../application/use-cases/tenant/update-tenant-sarvam-agent-variables.use-case";
import type { UpdateTenantSarvamAgentWelcomeMessageUseCase } from "../../application/use-cases/tenant/update-tenant-sarvam-agent-welcome-message.use-case";
import { UnauthorizedError } from "../../../../shared/errors/unauthorized.error";

export class TenantSarvamAgentController {
  constructor(
    private readonly listUseCase: ListTenantSarvamAgentsUseCase,
    private readonly getUseCase: GetTenantSarvamAgentUseCase,
    private readonly updateVariablesUseCase: UpdateTenantSarvamAgentVariablesUseCase,
    private readonly updateWelcomeMessageUseCase: UpdateTenantSarvamAgentWelcomeMessageUseCase,
  ) {}

  private getTenantId(req: Request): string {
    const user = (req as AuthRequest).user as TenantAuthContext | undefined;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new UnauthorizedError("Tenant context is required.");
    }
    return tenantId;
  }

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.getTenantId(req);
      const items = await this.listUseCase.execute(tenantId);
      sendSuccess(res, items);
    } catch (err) {
      next(err);
    }
  };

  getById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.getTenantId(req);
      const id = param(req, "id");
      const result = await this.getUseCase.execute(id, tenantId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  updateVariables = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.getTenantId(req);
      const id = param(req, "id");
      const result = await this.updateVariablesUseCase.execute(
        id,
        tenantId,
        req.body,
      );
      sendSuccess(
        res,
        result,
        HttpStatus.OK,
        "Agent variables updated successfully.",
      );
    } catch (err) {
      next(err);
    }
  };

  updateWelcomeMessage = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = this.getTenantId(req);
      const id = param(req, "id");
      const result = await this.updateWelcomeMessageUseCase.execute(
        id,
        tenantId,
        req.body,
      );
      sendSuccess(
        res,
        result,
        HttpStatus.OK,
        "Welcome message updated successfully.",
      );
    } catch (err) {
      next(err);
    }
  };
}
