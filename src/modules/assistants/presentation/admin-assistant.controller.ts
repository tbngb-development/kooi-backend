import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { AdminMessages } from "../../../shared/constants/messages";
import { param } from "../../../shared/utils/paramHelper";
import { type ListAssistantsUseCase } from "../application/use-cases/list-assistants.use-case";
import { type ListBolnaAgentsUseCase } from "../application/use-cases/list-bolna-agents.use-case";
import { type GetAssistantUseCase } from "../application/use-cases/get-assistant.use-case";
import { type RegisterAssistantUseCase } from "../application/use-cases/register-assistant.use-case";
import { type UpdateAssistantUseCase } from "../application/use-cases/update-assistant.use-case";
import { type DeleteAssistantUseCase } from "../application/use-cases/delete-assistant.use-case";
import { TenantBadRequestError } from "../../tenants/domain/tenant.errors";

export class AdminAssistantController {
  constructor(
    private readonly listAssistantsUseCase: ListAssistantsUseCase,
    private readonly listBolnaAgentsUseCase: ListBolnaAgentsUseCase,
    private readonly getAssistantUseCase: GetAssistantUseCase,
    private readonly registerAssistantUseCase: RegisterAssistantUseCase,
    private readonly updateAssistantUseCase: UpdateAssistantUseCase,
    private readonly deleteAssistantUseCase: DeleteAssistantUseCase,
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
      sendSuccess(
        res,
        await this.listAssistantsUseCase.execute(this.resolveTenantId(req)),
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
      sendSuccess(
        res,
        await this.getAssistantUseCase.execute(
          this.resolveTenantId(req),
          param(req, "id"),
        ),
      );
    } catch (err) {
      next(err);
    }
  };

  register = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const data = await this.registerAssistantUseCase.execute({
        tenantId: this.resolveTenantId(req),
        name: req.body.name,
        platformAgentId: req.body.platformAgentId,
      });
      sendSuccess(res, data, HttpStatus.CREATED);
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
      const data = await this.updateAssistantUseCase.execute({
        tenantId: this.resolveTenantId(req),
        id: param(req, "id"),
        name: req.body.name,
      });
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  remove = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.deleteAssistantUseCase.execute(
        this.resolveTenantId(req),
        param(req, "id"),
      );
      sendSuccess(res, { message: "Assistant removed successfully" });
    } catch (err) {
      next(err);
    }
  };
}
