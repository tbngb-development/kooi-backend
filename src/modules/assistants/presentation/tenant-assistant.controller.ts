import type { Request, Response, NextFunction } from "express";
import type { AuthRequest, TenantAuthContext } from "../../../shared/types";
import { sendSuccess } from "../../../shared/utils/response";
import { param } from "../../../shared/utils/paramHelper";
import { type ListAssistantsUseCase } from "../application/use-cases/list-assistants.use-case";
import { type GetAssistantUseCase } from "../application/use-cases/get-assistant.use-case";
import { type UpdateAssistantUseCase } from "../application/use-cases/update-assistant.use-case";

export class TenantAssistantController {
  constructor(
    private readonly listAssistantsUseCase: ListAssistantsUseCase,
    private readonly getAssistantUseCase: GetAssistantUseCase,
    private readonly updateAssistantUseCase: UpdateAssistantUseCase,
  ) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      sendSuccess(res, await this.listAssistantsUseCase.execute(tenantId));
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
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      sendSuccess(
        res,
        await this.getAssistantUseCase.execute(tenantId, param(req, "id")),
      );
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
      const { tenantId } = (req as AuthRequest).user as TenantAuthContext;
      const data = await this.updateAssistantUseCase.execute({
        tenantId,
        id: param(req, "id"),
        name: req.body.name,
        variables: req.body.variables,
      });
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}
