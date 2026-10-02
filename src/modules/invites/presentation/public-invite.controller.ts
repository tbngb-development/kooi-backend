import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { param } from "../../../shared/utils/paramHelper";
import type { GetOwnerInviteUseCase } from "../application/use-cases/get-owner-invite.use-case";
import type { AcceptOwnerInviteUseCase } from "../application/use-cases/accept-owner-invite.use-case";

export class PublicInviteController {
  constructor(
    private readonly getInvite: GetOwnerInviteUseCase,
    private readonly acceptInvite: AcceptOwnerInviteUseCase,
  ) {}

  get = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const token = param(req, "token");
      const result = await this.getInvite.execute(token);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  accept = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.acceptInvite.execute(req.body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
  
}
