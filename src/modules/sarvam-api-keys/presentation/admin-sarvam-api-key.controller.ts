import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import type { AuthRequest } from "../../../shared/types";
import type { CreateSarvamApiKeyUseCase } from "../application/use-cases/create-sarvam-api-key.use-case";
import type { UpdateSarvamApiKeyUseCase } from "../application/use-cases/update-sarvam-api-key.use-case";
import type { GetSarvamApiKeyUseCase } from "../application/use-cases/get-sarvam-api-key.use-case";
import type { ListSarvamApiKeysUseCase } from "../application/use-cases/list-sarvam-api-keys.use-case";
import type { DeleteSarvamApiKeyUseCase } from "../application/use-cases/delete-sarvam-api-key.use-case";

export class AdminSarvamApiKeyController {
  constructor(
    private readonly createUseCase: CreateSarvamApiKeyUseCase,
    private readonly updateUseCase: UpdateSarvamApiKeyUseCase,
    private readonly getUseCase: GetSarvamApiKeyUseCase,
    private readonly listUseCase: ListSarvamApiKeysUseCase,
    private readonly deleteUseCase: DeleteSarvamApiKeyUseCase,
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
      sendSuccess(
        res,
        { id },
        HttpStatus.OK,
        "Sarvam API key deleted successfully",
      );
    } catch (err) {
      next(err);
    }
  };
}

