import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/utils/response";
import { HttpStatus } from "../../../shared/constants/http-status";
import { param } from "../../../shared/utils/paramHelper";
import type { AuthRequest } from "../../../shared/types";
import type { InviteStatus } from "@prisma/client";
import type { CreateOwnerInviteUseCase } from "../application/use-cases/create-owner-invite.use-case";
import type { ResendOwnerInviteUseCase } from "../application/use-cases/resend-owner-invite.use-case";
import type { RevokeOwnerInviteUseCase } from "../application/use-cases/revoke-owner-invite.use-case";
import type { ListOwnerInvitesUseCase } from "../application/use-cases/list-owner-invites.use-case";

export class AdminInviteController {
  constructor(
    private readonly createInvite: CreateOwnerInviteUseCase,
    private readonly resendInvite: ResendOwnerInviteUseCase,
    private readonly revokeInvite: RevokeOwnerInviteUseCase,
    private readonly listInvites: ListOwnerInvitesUseCase,
  ) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = req.query.status as InviteStatus | undefined;
      const result = await this.listInvites.execute(status);
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
      const result = await this.createInvite.execute({
        ...req.body,
        invitedBy: userId,
      });
      sendSuccess(res, result, HttpStatus.CREATED);
    } catch (err) {
      next(err);
    }
  };

  resend = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.resendInvite.execute(param(req, "id"));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };

  revoke = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.revokeInvite.execute(param(req, "id"));
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  };
}
