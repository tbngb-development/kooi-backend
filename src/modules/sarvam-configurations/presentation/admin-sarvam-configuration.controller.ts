import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import type { AuthRequest } from "../../../shared/types";
import type { CreateSarvamConfigurationUseCase } from "../application/use-cases/create-sarvam-configuration.use-case";
import type { UpdateSarvamConfigurationUseCase } from "../application/use-cases/update-sarvam-configuration.use-case";
import type { GetSarvamConfigurationUseCase } from "../application/use-cases/get-sarvam-configuration.use-case";
import type { ListSarvamConfigurationsUseCase } from "../application/use-cases/list-sarvam-configurations.use-case";
import type { DeleteSarvamConfigurationUseCase } from "../application/use-cases/delete-sarvam-configuration.use-case";

export class AdminSarvamConfigurationController {
  constructor(
    private readonly createUseCase: CreateSarvamConfigurationUseCase,
    private readonly updateUseCase: UpdateSarvamConfigurationUseCase,
    private readonly getUseCase: GetSarvamConfigurationUseCase,
    private readonly listUseCase: ListSarvamConfigurationsUseCase,
    private readonly deleteUseCase: DeleteSarvamConfigurationUseCase,
  ) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.listUseCase.execute(req.query);
      sendSuccess(res, result);
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
      const result = await this.createUseCase.execute({
        ...req.body,
        createdBy: userId,
      });
      sendSuccess(res, result, HttpStatus.CREATED);
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
      const id = param(req, "id");
      const result = await this.getUseCase.execute(id);
      sendSuccess(res, result);
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
      const id = param(req, "id");
      const { userId } = (req as AuthRequest).user;
      const result = await this.updateUseCase.execute({
        id,
        ...req.body,
        updatedBy: userId,
      });
      sendSuccess(res, result);
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
      const id = param(req, "id");
      const { userId } = (req as AuthRequest).user;
      await this.deleteUseCase.execute(id, userId);
      sendSuccess(res, { id }, HttpStatus.OK, "Configuration deleted successfully");
    } catch (err) {
      next(err);
    }
  };
}

